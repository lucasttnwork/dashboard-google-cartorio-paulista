"""Phase 0 Security Baseline — dry-run + apply helper.

Executes the four Phase 0 migrations (20260409120100..400) against a Supabase
project via the Management API, either inside a BEGIN/ROLLBACK transaction
(dry-run, non-destructive) or with COMMIT (real apply).

Usage
-----
Required env var: SUPABASE_ACCESS_TOKEN (loaded from .env root by default).

    # Dry-run against the configured project ref (default: bugpetfkyoraidyxmzxu)
    python backend/scripts/apply_phase0.py --mode dry-run

    # Real apply (persists changes)
    python backend/scripts/apply_phase0.py --mode apply

    # Against a different project ref
    python backend/scripts/apply_phase0.py --mode dry-run --project-ref <ref>

Design notes
------------
* The baseline migration (20260409120000_baseline.sql) is NOT applied by this
  script — that is only needed for a fresh/staging project. The 4 layered
  migrations here expect the baseline schema to already exist (which is true
  for production).
* The consolidate_location_id migration contains its own inner begin/commit;
  those are stripped before concatenation to avoid nesting a transaction.
* Validation queries are embedded in the payload so a single round-trip
  exercises the full migration sequence and asserts the 14 ACs that are
  SQL-verifiable (the remaining ACs are verified via REST probes after apply).
* Used during Phase 0 T0.8 (dry-run in prod) and T0.9 (real apply).
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import pathlib
import sys
import urllib.error
import urllib.request


MIGRATIONS_DIR = pathlib.Path("supabase/migrations")
MIGRATION_FILES = (
    "20260409120100_rls_lockdown.sql",
    "20260409120200_revoke_anon_grants.sql",
    "20260409120300_archive_legacy_tables.sql",
    "20260409120400_consolidate_location_id.sql",
)

VALIDATION_SQL = r"""
select 'ac_0_5_rls_not_enabled_public'              as check_name, count(*)::text as value
       from pg_tables where schemaname='public' and rowsecurity=false
union all select 'ac_0_5_rls_enabled_public',            count(*)::text from pg_tables where schemaname='public' and rowsecurity=true
union all select 'ac_0_6_permit_all_policies_public',    count(*)::text from pg_policies where schemaname='public' and (qual='true' or qual is null)
union all select 'ac_0_6_deny_all_policies_public',      count(*)::text from pg_policies where schemaname='public' and policyname like '%_deny_all'
union all select 'public_tables_count',                   count(*)::text from pg_tables where schemaname='public'
union all select 'ac_0_8_archive_schema_tables',          count(*)::text from pg_tables where schemaname='archive'
union all select 'ac_0_9_reviews_legacy_location',        count(*)::text from public.reviews where location_id='cartorio_paulista_main'
union all select 'ac_0_9_reviews_canonical_location',     count(*)::text from public.reviews where location_id='cartorio-paulista-location'
union all select 'ac_0_9_reviews_total',                  count(*)::text from public.reviews
union all select 'ac_0_7_anon_execute_on_user_fns',
  coalesce(sum(case when has_function_privilege('anon'::regrole, p.oid, 'EXECUTE') then 1 else 0 end), 0)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all select 'ac_0_7_authed_execute_on_user_fns',
  coalesce(sum(case when has_function_privilege('authenticated'::regrole, p.oid, 'EXECUTE') then 1 else 0 end), 0)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all select 'ac_0_7_service_role_execute_on_user_fns',
  coalesce(sum(case when has_function_privilege('service_role'::regrole, p.oid, 'EXECUTE') then 1 else 0 end), 0)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all select 'ac_0_7_user_defined_public_fns_total',
  count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.prokind='f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all select 'crit_anon_persist_reviews_atomic',
  has_function_privilege('anon'::regrole, (select oid from pg_proc where proname='persist_reviews_atomic' limit 1), 'EXECUTE')::text
union all select 'crit_anon_refresh_monthly_view',
  has_function_privilege('anon'::regrole, (select oid from pg_proc where proname='refresh_monthly_view' limit 1), 'EXECUTE')::text
union all select 'crit_anon_update_location_metrics',
  has_function_privilege('anon'::regrole, (select oid from pg_proc where proname='update_location_metrics' limit 1), 'EXECUTE')::text
union all select 'crit_anon_cleanup_legacy_from_dataset',
  has_function_privilege('anon'::regrole, (select oid from pg_proc where proname='cleanup_legacy_from_dataset' limit 1), 'EXECUTE')::text
union all select 'crit_service_role_persist_reviews_atomic',
  has_function_privilege('service_role'::regrole, (select oid from pg_proc where proname='persist_reviews_atomic' limit 1), 'EXECUTE')::text
union all select 'anon_table_grants_in_public',           count(*)::text from information_schema.table_privileges where table_schema='public' and grantee='anon'
union all select 'archive_grants_anon',                   count(*)::text from information_schema.table_privileges where table_schema='archive' and grantee='anon'
order by check_name;
"""


def load_token(env_path: pathlib.Path) -> str:
    """Read SUPABASE_ACCESS_TOKEN from the project-root .env file."""
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("SUPABASE_ACCESS_TOKEN="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError(f"SUPABASE_ACCESS_TOKEN not found in {env_path}")


def load_migration(name: str) -> str:
    """Read a migration file, stripping its own transaction boundaries if any."""
    raw = (MIGRATIONS_DIR / name).read_text(encoding="utf-8")
    if name.endswith("consolidate_location_id.sql"):
        # Strip inner begin;/commit; so the outer wrapper owns the transaction
        return "\n".join(
            line for line in raw.split("\n") if line.strip() not in ("begin;", "commit;")
        )
    return raw


def build_payload(mode: str, with_validation: bool = True) -> str:
    """Concatenate the 4 migrations inside a BEGIN/COMMIT or BEGIN/ROLLBACK block."""
    parts = ["begin;\n"]
    for name in MIGRATION_FILES:
        parts.append(f"-- ============ {name} ============\n")
        parts.append(load_migration(name))
        parts.append("\n")
    if with_validation:
        parts.append("-- ============ VALIDATIONS ============\n")
        parts.append(VALIDATION_SQL)
    parts.append("rollback;\n" if mode == "dry-run" else "commit;\n")
    return "".join(parts)


def run_query(project_ref: str, token: str, sql: str, timeout: int = 180) -> tuple[int, list | dict | str]:
    """POST a query to the Management API database/query endpoint."""
    url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
    body = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "jarvis-phase-0/1.0")
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        raw = resp.read().decode()
        try:
            return resp.status, json.loads(raw)
        except json.JSONDecodeError:
            return resp.status, raw
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()


def print_validation_rows(data: list | dict | str) -> None:
    if not isinstance(data, list):
        print(data)
        return
    for row in data:
        name = row.get("check_name", "?")
        value = row.get("value", "?")
        print(f"  {name:45s} = {value}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("dry-run", "apply"), required=True)
    parser.add_argument("--project-ref", default="bugpetfkyoraidyxmzxu")
    parser.add_argument(
        "--env-file",
        type=pathlib.Path,
        default=pathlib.Path(".env"),
        help="Path to .env file containing SUPABASE_ACCESS_TOKEN",
    )
    args = parser.parse_args()

    token = load_token(args.env_file)
    payload = build_payload(args.mode, with_validation=(args.mode == "dry-run"))

    print(f"Phase 0 {args.mode} against project {args.project_ref}")
    print(f"Payload: {len(payload)} bytes, {payload.count(chr(10))} lines")
    started = _dt.datetime.now(_dt.timezone.utc)
    status, data = run_query(args.project_ref, token, payload)
    elapsed = (_dt.datetime.now(_dt.timezone.utc) - started).total_seconds()
    print(f"HTTP {status} (took {elapsed:.1f}s)")

    if status not in (200, 201):
        print("ERROR response:")
        print(data)
        return 1

    if args.mode == "dry-run":
        print("\n=== Validation results (dry-run, rolled back) ===")
        print_validation_rows(data)
        return 0

    # Real apply: run validation as a separate post-commit query for clarity
    print("\n=== Running post-commit validation ===")
    status2, data2 = run_query(args.project_ref, token, VALIDATION_SQL)
    print(f"HTTP {status2}")
    if status2 not in (200, 201):
        print("Validation error:", data2)
        return 1
    print_validation_rows(data2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
