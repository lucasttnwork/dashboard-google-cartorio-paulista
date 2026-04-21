"""arq task: analyze review sentiment and collaborator mentions via Gemini.

Batched pipeline:
- System prompt carries the dynamic list of active collaborators (+ aliases).
- User prompt packs up to `nlp_batch_size` reviews tagged [R1]..[RN].
- A single OpenRouter call returns one entry per review, routed back by tag.

A single-review wrapper `analyze_review` is kept for backward compatibility
with any job previously enqueued by the collector.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import structlog

from app.settings import settings

logger = structlog.get_logger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "google/gemini-2.5-flash-lite"

SYSTEM_PROMPT_TEMPLATE = """Você é um analisador de avaliações de um cartório em São Paulo.

Para CADA avaliação recebida, você deve identificar:
1. "sentiment": classificação geral ("positive", "negative", "neutral", "mixed").
2. "mentions": lista de colaboradores mencionados na avaliação. Para cada menção:
   - "name": nome EXATO do colaborador, usando o `full_name` listado abaixo (não o apelido).
   - "sentiment": sentimento dirigido a esse colaborador ("positive", "negative", "neutral").
   - "confidence": float entre 0.0 e 1.0.
   - "excerpt": trecho relevante do texto (máx. 100 caracteres).

Só inclua colaboradores que aparecem nesta lista oficial (name ou qualquer alias):
{collaborators_json}

Se a avaliação não mencionar nenhum colaborador, retorne "mentions": [].

Formato de saída OBRIGATÓRIO — JSON válido, sem markdown, sem comentários:
{{
  "results": [
    {{"key": "R1", "sentiment": "...", "mentions": [...]}},
    {{"key": "R2", "sentiment": "...", "mentions": [...]}}
  ]
}}

A ordem e as keys devem corresponder exatamente às avaliações enviadas.
"""


def _build_user_prompt(tagged_reviews: list[tuple[str, str]]) -> str:
    """Format reviews for the user message. Each review is isolated by tag."""
    blocks = []
    for key, text in tagged_reviews:
        blocks.append(f"[{key}]\n{text.strip()}\n[/{key}]")
    return "Analise as seguintes avaliações:\n\n" + "\n\n".join(blocks)


async def _fetch_active_collaborators(pool) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, full_name, aliases
               FROM collaborators
               WHERE is_active = true"""
        )

    collaborators: list[dict[str, Any]] = []
    for row in rows:
        aliases = row["aliases"] or []
        if isinstance(aliases, str):
            try:
                aliases = json.loads(aliases)
            except (json.JSONDecodeError, TypeError):
                aliases = []
        collaborators.append(
            {"id": row["id"], "name": row["full_name"], "aliases": list(aliases)}
        )
    return collaborators


def _build_name_map(collaborators: list[dict[str, Any]]) -> dict[str, int]:
    name_map: dict[str, int] = {}
    for c in collaborators:
        name_map[c["name"].lower()] = c["id"]
        for alias in c.get("aliases", []):
            if alias:
                name_map[alias.lower()] = c["id"]
    return name_map


async def _mark_failed(pool, review_ids: list[str]) -> None:
    if not pool or not review_ids:
        return
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE reviews SET sentiment = 'analysis_failed', analyzed_at = $1 "
            "WHERE review_id = ANY($2::text[])",
            now, review_ids,
        )


async def _persist_result(
    conn,
    *,
    review_id: str,
    sentiment: str,
    mentions: list[dict[str, Any]],
    name_map: dict[str, int],
    confidence_threshold: float,
) -> int:
    now = datetime.now(timezone.utc)
    await conn.execute(
        "UPDATE reviews SET sentiment = $1, analyzed_at = $2 WHERE review_id = $3",
        sentiment, now, review_id,
    )

    written = 0
    for mention in mentions:
        try:
            confidence = float(mention.get("confidence", 0.0))
        except (TypeError, ValueError):
            continue
        if confidence < confidence_threshold:
            continue

        raw_name = str(mention.get("name", "")).lower().strip()
        collaborator_id = name_map.get(raw_name)
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
            str(mention.get("sentiment", "neutral")),
            confidence,
            str(mention.get("excerpt", ""))[:100],
        )
        written += 1
    return written


async def analyze_reviews_batch(ctx: dict, *, review_ids: list[str]) -> dict:
    """Analyze up to settings.nlp_batch_size reviews in a single LLM call."""
    pool = ctx.get("db_pool")
    http_client = ctx.get("http_client")

    if not review_ids:
        return {"status": "skipped", "reason": "empty_batch"}

    if not pool or not http_client:
        logger.error(
            "analyze_batch.missing_deps",
            pool=pool is not None,
            http=http_client is not None,
        )
        return {"status": "error", "reason": "missing_deps"}

    if not settings.openrouter_api_key:
        logger.warning("analyze_batch.no_api_key")
        return {"status": "skipped", "reason": "no_api_key"}

    batch_size = max(1, settings.nlp_batch_size)
    review_ids = review_ids[:batch_size]

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT review_id, comment FROM reviews WHERE review_id = ANY($1::text[])",
            review_ids,
        )

    comments_by_id = {row["review_id"]: row["comment"] for row in rows}
    tagged: list[tuple[str, str]] = []
    key_to_review_id: dict[str, str] = {}
    skipped_no_text: list[str] = []

    for idx, rid in enumerate(review_ids, start=1):
        text = comments_by_id.get(rid)
        if not text:
            skipped_no_text.append(rid)
            continue
        key = f"R{idx}"
        tagged.append((key, text))
        key_to_review_id[key] = rid

    if not tagged:
        logger.info("analyze_batch.no_text", review_ids=review_ids)
        return {"status": "skipped", "reason": "no_text", "skipped": len(skipped_no_text)}

    collaborators = await _fetch_active_collaborators(pool)
    name_map = _build_name_map(collaborators)

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        collaborators_json=json.dumps(collaborators, ensure_ascii=False),
    )
    user_prompt = _build_user_prompt(tagged)

    payload = {
        "model": MODEL,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "max_tokens": 400 * len(tagged),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "HTTP-Referer": "dashboard-cartorio",
        "X-Title": "cartorio-nlp",
        "Content-Type": "application/json",
    }

    response = await http_client.post(OPENROUTER_URL, json=payload, headers=headers)

    if response.status_code in (429, 500, 503):
        logger.warning(
            "analyze_batch.retryable_error",
            status=response.status_code,
            batch_size=len(tagged),
        )
        raise RuntimeError(f"OpenRouter returned {response.status_code}")

    if response.status_code != 200:
        logger.error(
            "analyze_batch.api_error",
            status=response.status_code,
            body=response.text[:200],
        )
        await _mark_failed(pool, list(key_to_review_id.values()))
        return {"status": "error", "reason": f"http_{response.status_code}"}

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
        logger.error("analyze_batch.invalid_json", error=str(exc))
        await _mark_failed(pool, list(key_to_review_id.values()))
        return {"status": "error", "reason": "invalid_json"}

    results = parsed.get("results") if isinstance(parsed, dict) else None
    if not isinstance(results, list):
        logger.error("analyze_batch.bad_shape", parsed=str(parsed)[:200])
        await _mark_failed(pool, list(key_to_review_id.values()))
        return {"status": "error", "reason": "bad_shape"}

    processed = 0
    total_mentions = 0
    covered_keys: set[str] = set()

    async with pool.acquire() as conn:
        for entry in results:
            if not isinstance(entry, dict):
                continue
            key = str(entry.get("key", "")).strip()
            review_id = key_to_review_id.get(key)
            if not review_id:
                continue
            covered_keys.add(key)
            sentiment = str(entry.get("sentiment", "neutral"))
            mentions = entry.get("mentions", []) or []
            if not isinstance(mentions, list):
                mentions = []
            written = await _persist_result(
                conn,
                review_id=review_id,
                sentiment=sentiment,
                mentions=mentions,
                name_map=name_map,
                confidence_threshold=settings.nlp_confidence_threshold,
            )
            processed += 1
            total_mentions += written

    missing_keys = [k for k in key_to_review_id if k not in covered_keys]
    if missing_keys:
        missing_ids = [key_to_review_id[k] for k in missing_keys]
        logger.warning("analyze_batch.missing_results", missing=missing_ids)
        await _mark_failed(pool, missing_ids)

    logger.info(
        "analyze_batch.completed",
        processed=processed,
        mentions=total_mentions,
        skipped_no_text=len(skipped_no_text),
        missing=len(missing_keys),
    )
    return {
        "status": "completed",
        "processed": processed,
        "mentions": total_mentions,
        "skipped_no_text": len(skipped_no_text),
        "missing": len(missing_keys),
    }


async def analyze_review(ctx: dict, *, review_id: str) -> dict:
    """Backward-compatible single-review wrapper over the batched task."""
    return await analyze_reviews_batch(ctx, review_ids=[review_id])
