"""
Script determinístico que lê o JSON gerado por `review_alias_imputer` e faz upsert
dos `mention_text` como aliases dos colaboradores no Supabase, evitando duplicações.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

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
        allowed_methods=["GET", "PATCH"],
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def normalize(text: str) -> str:
    return text.strip().lower()


def load_mentions_file(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        print(f"[ERROR] Arquivo não encontrado: {path}", file=sys.stderr)
        sys.exit(1)
    content = path.read_text(encoding="utf-8")
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        print("[ERROR] Falha ao interpretar o JSON de input:", exc, file=sys.stderr)
        sys.exit(1)


def group_mentions(records: List[Dict[str, Any]]) -> Dict[int, Dict[str, str]]:
    grouped: Dict[int, Dict[str, str]] = {}
    for record in records:
        collab_id = record.get("collaborator_id")
        mention = (record.get("mention_text") or "").strip()
        if not collab_id or not mention:
            continue
        try:
            collab_id = int(collab_id)
        except (TypeError, ValueError):
            continue
        norm = normalize(mention)
        bucket = grouped.setdefault(collab_id, {})
        if norm in bucket:
            continue
        bucket[norm] = mention
    return grouped


def fetch_collaborators(
    session: requests.Session,
    supabase_url: str,
    headers: Dict[str, str],
    collaborator_ids: List[int],
) -> List[Dict[str, Any]]:
    params = {
        "select": "id,full_name,aliases",
        "id": f"in.({','.join(str(cid) for cid in collaborator_ids)})",
    }
    resp = session.get(
        f"{supabase_url}/rest/v1/collaborators", headers=headers, params=params, timeout=30
    )
    resp.raise_for_status()
    return resp.json()


def prepare_aliases(
    current_aliases: List[Any], mention_map: Dict[str, str]
) -> Optional[List[str]]:
    sanitized_current = [alias for alias in current_aliases if isinstance(alias, str) and alias.strip()]
    normalized_current = {normalize(alias): alias for alias in sanitized_current}
    updates = sanitized_current.copy()
    added = False
    for norm, alias in mention_map.items():
        if norm in normalized_current:
            continue
        updates.append(alias)
        normalized_current[norm] = alias
        added = True
    return updates if added else None


def patch_collaborator_aliases(
    session: requests.Session,
    supabase_url: str,
    headers: Dict[str, str],
    collaborator_id: int,
    aliases: List[str],
) -> None:
    payload = {"aliases": aliases}
    resp = session.patch(
        f"{supabase_url}/rest/v1/collaborators",
        headers=headers,
        params={"id": f"eq.{collaborator_id}"},
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    print(f"[LOG] Atualizado colaborador {collaborator_id} com {len(aliases)} aliases.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Lê JSON com menções detectadas e faz upsert dos aliases no Supabase."
    )
    parser.add_argument(
        "--file",
        "-f",
        required=True,
        type=Path,
        help="Caminho para o JSON gerado pelo review_alias_imputer.",
    )
    args = parser.parse_args()

    supabase_url = validate_env_var("SUPABASE_URL")
    supabase_key = validate_env_var("SUPABASE_SERVICE_ROLE_KEY")

    base_headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
    }
    patch_headers = {**base_headers, "Content-Type": "application/json", "Prefer": "return=representation"}

    records = load_mentions_file(args.file)
    grouped_mentions = group_mentions(records)
    if not grouped_mentions:
        print("Nenhuma menção válida encontrada no arquivo.")
        return

    session = build_session()
    collaborator_ids = sorted(grouped_mentions.keys())
    collaborators = fetch_collaborators(session, supabase_url, base_headers, collaborator_ids)
    collaborator_by_id = {collab["id"]: collab for collab in collaborators}

    for collab_id in collaborator_ids:
        collaborator = collaborator_by_id.get(collab_id)
        if not collaborator:
            print(f"[WARN] Colaborador {collab_id} não existe no Supabase.")
            continue
        mention_map = grouped_mentions[collab_id]
        existing_aliases = collaborator.get("aliases") or []
        updates = prepare_aliases(existing_aliases, mention_map)
        if not updates:
            print(f"[INFO] Nenhum alias novo para {collaborator.get('full_name')} ({collab_id}).")
            continue
        patch_collaborator_aliases(session, supabase_url, patch_headers, collab_id, updates)


if __name__ == "__main__":
    main()

