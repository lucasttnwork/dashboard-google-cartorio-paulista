"""arq task: analyze review sentiment and collaborator mentions via Gemini."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import structlog

from app.settings import settings

logger = structlog.get_logger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "google/gemini-2.5-flash-lite"

NLP_PROMPT_TEMPLATE = """Analise a seguinte avaliação de um cartório e retorne um JSON com:
1. "sentiment": classificação geral ("positive", "negative", "neutral", "mixed")
2. "mentions": array de colaboradores mencionados

Para cada menção:
- "name": nome exato do colaborador detectado no texto
- "sentiment": sentimento em relação a esse colaborador ("positive", "negative", "neutral")
- "confidence": float 0.0 a 1.0
- "excerpt": trecho relevante do texto (max 100 chars)

Colaboradores ativos e aliases:
{collaborators_json}

Texto da avaliação:
---
{review_text}
---

Responda SOMENTE com JSON válido, sem markdown."""


async def analyze_review(ctx: dict, *, review_id: str) -> dict:
    """Analyze a review's sentiment and detect collaborator mentions."""
    pool = ctx.get("db_pool")
    http_client = ctx.get("http_client")

    if not pool or not http_client:
        logger.error("analyze.missing_deps", pool=pool is not None, http=http_client is not None)
        return {"status": "error", "reason": "missing_deps"}

    if not settings.openrouter_api_key:
        logger.warning("analyze.no_api_key")
        return {"status": "skipped", "reason": "no_api_key"}

    async with pool.acquire() as conn:
        review = await conn.fetchrow(
            "SELECT review_id, comment FROM reviews WHERE review_id = $1",
            review_id,
        )

    if not review or not review["comment"]:
        logger.info("analyze.no_text", review_id=review_id)
        return {"status": "skipped", "reason": "no_text"}

    async with pool.acquire() as conn:
        collaborators = await conn.fetch(
            """SELECT c.id, c.full_name, c.aliases
               FROM collaborators c
               WHERE c.is_active = true"""
        )

    collab_list = []
    for c in collaborators:
        aliases = c["aliases"] if c["aliases"] else []
        if isinstance(aliases, str):
            try:
                aliases = json.loads(aliases)
            except (json.JSONDecodeError, TypeError):
                aliases = []
        collab_list.append({"id": c["id"], "name": c["full_name"], "aliases": aliases})

    prompt = NLP_PROMPT_TEMPLATE.format(
        collaborators_json=json.dumps(collab_list, ensure_ascii=False),
        review_text=review["comment"],
    )

    payload = {
        "model": MODEL,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "max_tokens": 500,
        "messages": [{"role": "user", "content": prompt}],
    }

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "HTTP-Referer": "dashboard-cartorio",
        "X-Title": "cartorio-nlp",
        "Content-Type": "application/json",
    }

    response = await http_client.post(OPENROUTER_URL, json=payload, headers=headers)

    if response.status_code in (429, 500, 503):
        logger.warning("analyze.retryable_error", status=response.status_code, review_id=review_id)
        raise RuntimeError(f"OpenRouter returned {response.status_code}")

    if response.status_code != 200:
        logger.error("analyze.api_error", status=response.status_code, body=response.text[:200])
        await _mark_failed(pool, review_id)
        return {"status": "error", "reason": f"http_{response.status_code}"}

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        result = json.loads(content)
    except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
        logger.error("analyze.invalid_json", review_id=review_id, error=str(exc))
        await _mark_failed(pool, review_id)
        return {"status": "error", "reason": "invalid_json"}

    sentiment = result.get("sentiment", "neutral")
    mentions = result.get("mentions", [])

    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE reviews SET sentiment = $1, analyzed_at = $2 WHERE review_id = $3",
            sentiment, now, review_id,
        )

        collab_name_map = {c["name"].lower(): c["id"] for c in collab_list}
        for alias_entry in collab_list:
            for alias in alias_entry.get("aliases", []):
                collab_name_map[alias.lower()] = alias_entry["id"]

        written_mentions = 0
        for mention in mentions:
            confidence = mention.get("confidence", 0.0)
            if confidence < settings.nlp_confidence_threshold:
                continue

            mention_name = mention.get("name", "").lower()
            collaborator_id = collab_name_map.get(mention_name)
            if not collaborator_id:
                continue

            await conn.execute(
                """INSERT INTO review_collaborators
                   (review_id, collaborator_id, sentiment, confidence, excerpt, source)
                   VALUES ($1, $2, $3, $4, $5, 'gemini')
                   ON CONFLICT (review_id, collaborator_id) DO UPDATE SET
                       sentiment = EXCLUDED.sentiment,
                       confidence = EXCLUDED.confidence,
                       excerpt = EXCLUDED.excerpt,
                       source = 'gemini'""",
                review_id, collaborator_id,
                mention.get("sentiment", "neutral"),
                confidence,
                mention.get("excerpt", "")[:100],
            )
            written_mentions += 1

    logger.info(
        "analyze.completed",
        review_id=review_id,
        sentiment=sentiment,
        mentions=written_mentions,
    )
    return {"status": "completed", "sentiment": sentiment, "mentions": written_mentions}


async def _mark_failed(pool, review_id: str) -> None:
    """Mark review as analysis_failed."""
    if pool:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE reviews SET sentiment = 'analysis_failed', analyzed_at = $1 WHERE review_id = $2",
                datetime.now(timezone.utc), review_id,
            )
