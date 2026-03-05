"""
Script determinístico para extrair menções de colaboradores em reviews.
Segue o fluxo manual descrito em directives/review_alias_sop.md.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import logging
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def validate_env_var(name: str) -> str:
    value = os.getenv(name)
    if not value:
        print(f"[ERROR] Variável de ambiente {name} não encontrada.", file=sys.stderr)
        sys.exit(1)
    return value


def build_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def get_checkpoint(path: Path) -> Optional[datetime]:
    if not path.exists():
        return None
    try:
        return datetime.fromisoformat(path.read_text().strip())
    except ValueError:
        return None


def save_checkpoint(path: Path, dt: datetime) -> None:
    path.parent.mkdir(exist_ok=True, parents=True)
    path.write_text(dt.isoformat())


def get_reviews(
    supabase_url: str,
    headers: Dict[str, str],
    since: Optional[datetime],
    limit: int,
) -> List[Dict[str, Any]]:
    params: Dict[str, str] = {
        "select": "review_id,comment,create_time",
        "order": "create_time.desc",
        "limit": str(limit),
        "comment": "not.is.null",
    }
    if since:
        params["create_time"] = f"gte.{since.isoformat()}"
    session = build_session()
    resp = session.get(f"{supabase_url}/rest/v1/reviews", headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_collaborators(supabase_url: str, headers: Dict[str, str]) -> List[Dict[str, Any]]:
    params = {
        "select": "id,full_name,aliases,is_active",
        "is_active": "eq.true",
    }
    resp = requests.get(f"{supabase_url}/rest/v1/collaborators", headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def build_prompt(review: Dict[str, Any], collaborators: List[Dict[str, Any]]) -> str:
    collaborator_lines = []
    for collaborator in collaborators:
        aliases = collaborator.get("aliases") or []
        alias_text = ", ".join(aliases) if aliases else "nenhum alias conhecido"
        collaborator_lines.append(f"- {collaborator['full_name']} (aliases atuais: {alias_text})")

    return (
        "Analise o comentário abaixo e identifique se há menções a algum dos colaboradores "
        "da lista fornecida. **IMPORTANTE**: a maioria dos comentários NÃO contém menções; "
        "nesse caso, responda com `{\\\"mentions\\\": []}`. Caso exista menção, cada item deve trazer "
        "`collaborator_full_name`, `mention_text` (exatamente como o nome aparece no comentário) e "
        "`context` (trecho curto). Responda **apenas** com JSON válido, sem explicações extras.\n\n"
        "Exemplos de saída:\n"
        "{\\\"mentions\\\": []}\n"
        "{\\\"mentions\\\": [{\\\"collaborator_full_name\\\": \\\"ANA SOPHIA DE OLIVEIRA ROCHA\\\", "
        "\\\"mention_text\\\": \\\"Ana Sophia\\\", \\\"context\\\": \\\"Atendimento da Ana Sophia\\\"}]}\n\n"
        f"Colaboradores:\n" + "\n".join(collaborator_lines) + "\n\n"
        f"Comentário:\n{review['comment']}\n"
    )


def extract_json_from_text(text: str) -> Optional[str]:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return None
    return text[start : end + 1]


def call_openrouter(prompt: str, api_key: str) -> Optional[List[Dict[str, Any]]]:
    delay = float(os.getenv("IMPUTER_REQUEST_DELAY", "0"))
    if delay > 0:
        import time
        time.sleep(delay)
    url = "https://openrouter.ai/api/v1/chat/completions"
    payload = {
        "model": "stepfun/step-3.5-flash:free",
        "messages": [
            {
                "role": "system",
                "content": (
                    "Você é um detector de menções de colaboradores em comentários de reviews. "
                    "Para cada menção verdadeira, retorne `mention_text` exatamente como o nome aparece "
                    "no comentário (sem frases adicionais). Se nenhuma menção for encontrada, retorne "
                    "`{\"mentions\": []}`. Responda estritamente em JSON, sem explicações extras."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.0,
        "max_tokens": int(os.getenv("IMPUTER_MAX_TOKENS", "2000")),
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    resp = requests.post(url, headers=headers, json=payload, timeout=40)
    resp.raise_for_status()
    data = resp.json()
    choice = data.get("choices", [{}])[0]
    content = choice.get("message", {}).get("content") or ""
    payload = extract_json_from_text(content)
    if not payload:
        print("[WARN] Não foi possível extrair JSON válido da resposta:", content)
        return None
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        print("[WARN] Resposta do modelo não era JSON válido. Conteúdo retornado:", content)
        return None
    return parsed.get("mentions")


def get_variant_candidates(collaborator: Dict[str, Any]) -> List[str]:
    variants = [collaborator.get("full_name", "")]
    aliases = collaborator.get("aliases") or []
    variants.extend(alias for alias in aliases if isinstance(alias, str))
    # also include first two words of the full name to cover shortened mentions
    if collaborator.get("full_name"):
        words = collaborator["full_name"].split()
        if len(words) >= 2:
            variants.append(" ".join(words[:2]))
    return [variant.strip() for variant in variants if variant and variant.strip()]


def refine_mention_text(raw: Optional[str], collaborator: Dict[str, Any]) -> Optional[str]:
    if not raw:
        return None
    cleaned = raw.strip()
    candidates = get_variant_candidates(collaborator)
    lower_cleaned = cleaned.lower()
    for candidate in sorted(candidates, key=len, reverse=True):
        lower_candidate = candidate.lower()
        index = lower_cleaned.find(lower_candidate)
        if index != -1:
            return cleaned[index : index + len(candidate)]
    # fallback: if mention_text is short, keep it; else skip
    if len(cleaned) <= 30:
        return cleaned
    return None


def flatten_mentions(
    review: Dict[str, Any], mentions: List[Dict[str, Any]], collaborators: Dict[str, Dict[str, Any]]
) -> List[Dict[str, Any]]:
    results = []
    for mention in mentions:
        collaborator_name = mention.get("collaborator_full_name")
        collaborator = collaborators.get(collaborator_name)
        if not collaborator:
            continue
        mention_text = refine_mention_text(mention.get("mention_text"), collaborator)
        if not mention_text:
            logging.warning(
                "Menção ignorada: '%s' para colaborador %s",
                mention.get("mention_text"),
                collaborator_name,
            )
            continue
        results.append(
            {
                "review_id": review["review_id"],
                "full_name": collaborator_name,
                "collaborator_id": collaborator["id"],
                "mention_text": mention_text,
                "context": mention.get("context"),
                "timestamp": datetime.utcnow().isoformat(),
            }
        )
    return results


def persist_mentions(records: List[Dict[str, Any]]) -> Path:
    if not records:
        raise ValueError("Nenhuma menção para persistir.")
    output_dir = Path(".tmp")
    output_dir.mkdir(exist_ok=True)
    filename = output_dir / f"collaborator_aliases_{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}.json"
    filename.write_text(json.dumps(records, ensure_ascii=False, indent=2))
    return filename


def process_review(
    review: Dict[str, Any],
    collaborators: List[Dict[str, Any]],
    collab_lookup: Dict[str, Dict[str, Any]],
    openrouter_key: str,
) -> List[Dict[str, Any]]:
    prompt = build_prompt(review, collaborators)
    mentions = call_openrouter(prompt, openrouter_key)
    if not mentions:
        return []
    return flatten_mentions(review, mentions, collab_lookup)


def gather_records_concurrently(
    reviews: List[Dict[str, Any]],
    collaborators: List[Dict[str, Any]],
    collab_lookup: Dict[str, Dict[str, Any]],
    openrouter_key: str,
) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    max_workers = min(int(os.getenv("IMPUTER_MAX_WORKERS", "2")), len(reviews))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(process_review, review, collaborators, collab_lookup, openrouter_key): review
            for review in reviews
        }
        for future in as_completed(futures):
            try:
                records.extend(future.result())
            except Exception as exc:  # pragma: no cover - safety net
                review = futures[future]
                print(f"[WARN] falha ao processar review {review['review_id']}: {exc}")
    return records


def parse_create_time(value: str) -> datetime:
    normalized = value
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        # Tentativa manual quando o timezone possui separador +/-
        tz_index = max(normalized.rfind("+"), normalized.rfind("-"))
        if tz_index == -1:
            raise
        date_part = normalized[:tz_index]
        tz_part = normalized[tz_index:]
        if "." in date_part:
            prefix, frac = date_part.split(".", 1)
            frac = frac[:6].ljust(6, "0")
            date_part = f"{prefix}.{frac}"
        else:
            date_part = f"{date_part}.000000"
        dt = datetime.strptime(date_part, "%Y-%m-%dT%H:%M:%S.%f")
        sign = 1 if tz_part.startswith("+") else -1
        offset_hours, offset_minutes = map(int, tz_part[1:].split(":"))
        tz_delta = timedelta(hours=offset_hours, minutes=offset_minutes)
        return dt.replace(tzinfo=timezone(sign * tz_delta))


def get_latest_review_time(reviews: List[Dict[str, Any]]) -> Optional[datetime]:
    timestamps = [
        parse_create_time(review["create_time"])
        for review in reviews
        if review.get("create_time")
    ]
    return max(timestamps) if timestamps else None


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extrai menções de colaboradores em reviews e gera aliases temporários."
    )
    parser.add_argument(
        "--days", "-d", type=int, default=7, help="Número de dias anteriores para buscar reviews."
    )
    parser.add_argument(
        "--limit",
        "-l",
        type=int,
        default=50,
        help="Número máximo de reviews a serem consultadas (por padrão 50).",
    )
    parser.add_argument(
        "--use-checkpoint",
        action="store_true",
        help="Usa o timestamp da última execução para evitar reprocessar reviews antigas.",
    )
    args = parser.parse_args()

    supabase_url = validate_env_var("SUPABASE_URL")
    supabase_key = validate_env_var("SUPABASE_SERVICE_ROLE_KEY")
    openrouter_key = validate_env_var("OPENROUTER_API_KEY")

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
    }

    checkpoint_path = Path(".tmp/last_review_checkpoint.txt")
    since: Optional[datetime] = None
    if args.use_checkpoint:
        since = get_checkpoint(checkpoint_path)
        if not since:
            since = datetime.utcnow() - timedelta(days=args.days)
    else:
        since = datetime.utcnow() - timedelta(days=args.days)
    print(f"Buscando reviews a partir de {since.isoformat()}...")
    reviews = get_reviews(supabase_url, headers, since, args.limit)
    if not reviews:
        print("Nenhuma review encontrada no período solicitado.")
        return

    collaborators = get_collaborators(supabase_url, headers)
    collab_lookup = {collab["full_name"]: collab for collab in collaborators if collab["full_name"]}
    if not collab_lookup:
        print("Nenhum colaborador ativo encontrado.")
        return

    all_records = gather_records_concurrently(
        reviews, collaborators, collab_lookup, openrouter_key
    )

    if args.use_checkpoint:
        latest = get_latest_review_time(reviews)
        if latest:
            save_checkpoint(checkpoint_path, latest)

    if not all_records:
        print("Nenhuma menção detectada.")
        return

    output = persist_mentions(all_records)
    print(f"Menções persistidas em {output}")


if __name__ == "__main__":
    main()

