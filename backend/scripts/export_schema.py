"""Export the real production schema of a Supabase project into a SQL baseline.

Reads ``SUPABASE_ACCESS_TOKEN`` from the environment and queries the Supabase
Management API (``POST /v1/projects/{ref}/database/query``) to reconstruct the
DDL of a project's ``public`` schema. Emits an idempotent SQL file that can be
applied to a fresh Postgres 16 + Supabase database and reproduce the captured
state.

This script is intentionally dependency-free: it uses only the Python standard
library so it can run anywhere without touching ``pyproject.toml``.

Usage::

    export SUPABASE_ACCESS_TOKEN=sbp_xxx
    python backend/scripts/export_schema.py \
        --project-ref bugpetfkyoraidyxmzxu \
        --out supabase/migrations/20260409120000_baseline.sql

    # Dump counts only (no file output):
    python backend/scripts/export_schema.py --project-ref ... --counts-only

Safety: the access token is never logged or printed. SQL comments in the
emitted file are in English, matching project conventions.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

API_BASE = "https://api.supabase.com/v1/projects"
USER_AGENT = "cartorio-dashboard-export-schema/1.0"
TIMEOUT_S = 60

# System/extension/Supabase-managed schemas we never want to emit.
SYSTEM_SCHEMAS = {
    "information_schema",
    "pg_catalog",
    "pg_toast",
    "auth",
    "storage",
    "realtime",
    "extensions",
    "graphql",
    "graphql_public",
    "vault",
    "net",
    "pgsodium",
    "pgsodium_masks",
    "supabase_functions",
    "supabase_migrations",
    "_analytics",
    "_realtime",
    "_supavisor",
    "cron",
}

# Extensions that are always present in a fresh Postgres/Supabase DB.
SKIP_EXTENSIONS = {"plpgsql"}


class ApiError(RuntimeError):
    pass


def q(project_ref: str, sql: str, token: str) -> list[dict[str, Any]]:
    """Execute an SQL query via the Supabase Management API.

    Returns the JSON response as a list of row objects. Raises ``ApiError`` on
    non-200 responses.
    """
    url = f"{API_BASE}/{project_ref}/database/query"
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            if isinstance(data, dict) and "error" in data:
                raise ApiError(f"API error: {data['error']}")
            if not isinstance(data, list):
                raise ApiError(f"Unexpected response shape: {type(data).__name__}")
            return data
    except urllib.error.HTTPError as exc:
        # Read error body for diagnostics but never leak the token.
        try:
            err_body = exc.read().decode("utf-8")[:500]
        except Exception:  # noqa: BLE001
            err_body = "<unavailable>"
        raise ApiError(f"HTTP {exc.code} from Management API: {err_body}") from None
    except urllib.error.URLError as exc:
        raise ApiError(f"Network error talking to Management API: {exc}") from None


def scalar(rows: list[dict[str, Any]], key: str, default: Any = None) -> Any:
    if not rows:
        return default
    return rows[0].get(key, default)


# ---------------------------------------------------------------------------
# Extraction helpers
# ---------------------------------------------------------------------------


def get_extensions(project_ref: str, token: str) -> list[dict[str, Any]]:
    sql = """
        select
            e.extname          as name,
            n.nspname          as schema,
            e.extversion       as version
        from pg_extension e
        join pg_namespace n on n.oid = e.extnamespace
        order by e.extname;
    """
    return q(project_ref, sql, token)


def get_custom_schemas(project_ref: str, token: str) -> list[str]:
    sql = """
        select schema_name
        from information_schema.schemata
        where schema_name not like 'pg_%%'
        order by schema_name;
    """
    rows = q(project_ref, sql, token)
    return [
        r["schema_name"]
        for r in rows
        if r["schema_name"] not in SYSTEM_SCHEMAS and r["schema_name"] != "public"
    ]


def get_enums(project_ref: str, token: str) -> list[dict[str, Any]]:
    sql = """
        select
            n.nspname  as schema,
            t.typname  as name,
            array_agg(e.enumlabel order by e.enumsortorder) as labels
        from pg_type t
        join pg_namespace n on n.oid = t.typnamespace
        join pg_enum e on e.enumtypid = t.oid
        where t.typtype = 'e'
          and n.nspname = 'public'
        group by n.nspname, t.typname
        order by t.typname;
    """
    return q(project_ref, sql, token)


def get_tables(project_ref: str, token: str) -> list[dict[str, Any]]:
    sql = """
        select
            c.relname as name,
            obj_description(c.oid, 'pg_class') as comment,
            c.relrowsecurity  as rls_enabled,
            c.relforcerowsecurity as rls_forced
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
        order by c.relname;
    """
    return q(project_ref, sql, token)


def get_columns(project_ref: str, token: str, table: str) -> list[dict[str, Any]]:
    sql = f"""
        select
            a.attname                                  as name,
            format_type(a.atttypid, a.atttypmod)       as data_type,
            a.attnotnull                               as not_null,
            pg_get_expr(ad.adbin, ad.adrelid)          as default_expr,
            col_description(a.attrelid, a.attnum)      as comment,
            a.attnum                                   as ordinal
        from pg_attribute a
        left join pg_attrdef ad
            on ad.adrelid = a.attrelid and ad.adnum = a.attnum
        where a.attrelid = 'public."{table}"'::regclass
          and a.attnum > 0
          and not a.attisdropped
        order by a.attnum;
    """
    return q(project_ref, sql, token)


def get_table_constraints(
    project_ref: str, token: str, table: str
) -> list[dict[str, Any]]:
    """Return PK, UNIQUE, and CHECK constraints (not FKs)."""
    sql = f"""
        select
            c.conname                              as name,
            c.contype                              as type,
            pg_get_constraintdef(c.oid)            as definition
        from pg_constraint c
        where c.conrelid = 'public."{table}"'::regclass
          and c.contype in ('p', 'u', 'c')
        order by c.contype, c.conname;
    """
    return q(project_ref, sql, token)


def get_foreign_keys(project_ref: str, token: str) -> list[dict[str, Any]]:
    sql = """
        select
            nt.nspname                    as schema,
            t.relname                     as table_name,
            c.conname                     as name,
            pg_get_constraintdef(c.oid)   as definition
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace nt on nt.oid = t.relnamespace
        where c.contype = 'f'
          and nt.nspname = 'public'
        order by t.relname, c.conname;
    """
    return q(project_ref, sql, token)


def get_indexes(project_ref: str, token: str) -> list[dict[str, Any]]:
    """Return non-constraint indexes in public."""
    sql = """
        select
            i.schemaname   as schema,
            i.tablename    as table_name,
            i.indexname    as name,
            i.indexdef     as definition
        from pg_indexes i
        where i.schemaname = 'public'
          and not exists (
              select 1
              from pg_constraint c
              join pg_class cl on cl.oid = c.conindid
              where cl.relname = i.indexname
                and c.contype in ('p', 'u', 'x')
          )
        order by i.tablename, i.indexname;
    """
    return q(project_ref, sql, token)


def get_sequences(project_ref: str, token: str) -> list[dict[str, Any]]:
    sql = """
        select
            c.relname                                       as name,
            s.seqstart                                      as start_value,
            s.seqincrement                                  as increment_by,
            s.seqmin                                        as min_value,
            s.seqmax                                        as max_value,
            s.seqcache                                      as cache_size,
            s.seqcycle                                      as cycle,
            format_type(s.seqtypid, null)                   as data_type,
            -- Owned-by info: table.column that owns this sequence via serial/identity
            (
                select quote_ident(nc.nspname) || '.' || quote_ident(tc.relname) || '.' || quote_ident(a.attname)
                from pg_depend d
                join pg_class tc on tc.oid = d.refobjid
                join pg_namespace nc on nc.oid = tc.relnamespace
                join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
                where d.objid = c.oid
                  and d.classid = 'pg_class'::regclass
                  and d.refclassid = 'pg_class'::regclass
                  and d.deptype in ('a','i')
                limit 1
            ) as owned_by
        from pg_sequence s
        join pg_class c on c.oid = s.seqrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
        order by c.relname;
    """
    return q(project_ref, sql, token)


def get_functions(project_ref: str, token: str) -> list[dict[str, Any]]:
    """Return user-defined functions in public (excluding extension-owned)."""
    sql = """
        select
            p.proname               as name,
            pg_get_function_identity_arguments(p.oid) as args,
            pg_get_functiondef(p.oid) as definition
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prokind = 'f'
          and not exists (
              select 1
              from pg_depend d
              where d.objid = p.oid and d.deptype = 'e'
          )
        order by p.proname, pg_get_function_identity_arguments(p.oid);
    """
    return q(project_ref, sql, token)


def get_triggers(project_ref: str, token: str) -> list[dict[str, Any]]:
    sql = """
        select
            t.tgname                              as name,
            c.relname                             as table_name,
            pg_get_triggerdef(t.oid, true)        as definition
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and not t.tgisinternal
        order by c.relname, t.tgname;
    """
    return q(project_ref, sql, token)


def get_views(project_ref: str, token: str) -> list[dict[str, Any]]:
    sql = """
        select
            schemaname as schema,
            viewname   as name,
            definition
        from pg_views
        where schemaname = 'public'
        order by viewname;
    """
    return q(project_ref, sql, token)


def get_materialized_views(project_ref: str, token: str) -> list[dict[str, Any]]:
    sql = """
        select
            schemaname as schema,
            matviewname as name,
            definition
        from pg_matviews
        where schemaname = 'public'
        order by matviewname;
    """
    return q(project_ref, sql, token)


def get_policies(project_ref: str, token: str) -> list[dict[str, Any]]:
    sql = """
        select
            schemaname,
            tablename,
            policyname,
            permissive,
            cmd,
            roles,
            qual,
            with_check
        from pg_policies
        where schemaname = 'public'
        order by tablename, policyname;
    """
    return q(project_ref, sql, token)


def get_table_grants(project_ref: str, token: str) -> list[dict[str, Any]]:
    sql = """
        select
            grantee,
            table_schema,
            table_name,
            privilege_type,
            is_grantable
        from information_schema.role_table_grants
        where table_schema = 'public'
          and grantee in ('anon', 'authenticated', 'service_role', 'public')
        order by table_name, grantee, privilege_type;
    """
    return q(project_ref, sql, token)


def get_function_grants(project_ref: str, token: str) -> list[dict[str, Any]]:
    """Return EXECUTE grants on user-defined functions only.

    Filters out extension-owned functions (pgvector, pg_trgm, unaccent, ...)
    and pulls the function argument signature so the emitted GRANT can be
    unambiguous even for overloaded functions.
    """
    sql = """
        with targets as (
            select
                p.oid,
                p.proname as name,
                pg_get_function_identity_arguments(p.oid) as args
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.prokind = 'f'
              and not exists (
                  select 1 from pg_depend d
                  where d.objid = p.oid and d.deptype = 'e'
              )
        )
        select
            r.rolname                       as grantee,
            t.name                          as routine_name,
            t.args                          as args,
            'EXECUTE'                       as privilege_type
        from targets t
        cross join lateral (
            select rolname
            from pg_roles
            where rolname in ('anon', 'authenticated', 'service_role', 'public')
              and has_function_privilege(
                  rolname,
                  t.oid,
                  'EXECUTE'
              )
        ) r
        order by t.name, t.args, r.rolname;
    """
    return q(project_ref, sql, token)


# ---------------------------------------------------------------------------
# SQL emission
# ---------------------------------------------------------------------------


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def emit_header(buf: list[str], project_ref: str) -> None:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    buf.append("-- 20260409120000_baseline.sql")
    buf.append(f"-- Phase 0 Security Baseline -- captured from production {today}")
    buf.append(f"-- Source: Supabase project {project_ref} (Free plan)")
    buf.append("-- Extraction: backend/scripts/export_schema.py via Management API")
    buf.append(
        "-- Down: none (baseline); see subsequent migrations 20260409120100..400"
    )
    buf.append("--   for layered changes (rls_lockdown, revoke_anon_grants,")
    buf.append("--   archive_legacy_tables, consolidate_location_id).")
    buf.append("-- NOTE: includes existing permissive RLS policies AS-IS; they are")
    buf.append("--   dropped in 20260409120100_rls_lockdown.sql.")
    buf.append("-- NOTE: grants to anon/authenticated are preserved AS-IS; they are")
    buf.append("--   revoked in 20260409120200_revoke_anon_grants.sql.")
    buf.append("")


def emit_extensions(buf: list[str], exts: list[dict[str, Any]]) -> None:
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Extensions")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for e in exts:
        if e["name"] in SKIP_EXTENSIONS:
            continue
        schema = e["schema"] or "public"
        buf.append(
            f'create extension if not exists "{e["name"]}" with schema {quote_ident(schema)};'
        )
    buf.append("")


def emit_schemas(buf: list[str], schemas: list[str]) -> None:
    if not schemas:
        return
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Custom schemas")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for s in schemas:
        buf.append(f"create schema if not exists {quote_ident(s)};")
    buf.append("")


def _parse_pg_text_array(value: Any) -> list[str]:
    """Parse a Postgres ``text[]`` value as it comes back from the Management API.

    The API may return either a real JSON list (``["a", "b"]``) or a stringified
    Postgres array literal (``{a,b,"has space"}``). This helper normalizes both.
    """
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    if not isinstance(value, str):
        return [str(value)]
    s = value.strip()
    if s.startswith("{") and s.endswith("}"):
        s = s[1:-1]
    if not s:
        return []
    out: list[str] = []
    i = 0
    while i < len(s):
        if s[i] == '"':
            # Quoted element -- consume until unescaped quote.
            j = i + 1
            buf_item: list[str] = []
            while j < len(s):
                if s[j] == "\\" and j + 1 < len(s):
                    buf_item.append(s[j + 1])
                    j += 2
                    continue
                if s[j] == '"':
                    break
                buf_item.append(s[j])
                j += 1
            out.append("".join(buf_item))
            i = j + 1
            if i < len(s) and s[i] == ",":
                i += 1
        else:
            j = s.find(",", i)
            if j == -1:
                out.append(s[i:])
                break
            out.append(s[i:j])
            i = j + 1
    return out


def emit_enums(buf: list[str], enums: list[dict[str, Any]]) -> None:
    if not enums:
        return
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Enum types (public)")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for e in enums:
        labels_list = _parse_pg_text_array(e["labels"])
        labels = ", ".join(sql_literal(lbl) for lbl in labels_list)
        buf.append("do $$ begin")
        buf.append(
            f"  create type public.{quote_ident(e['name'])} as enum ({labels});"
        )
        buf.append("exception when duplicate_object then null;")
        buf.append("end $$;")
    buf.append("")


def emit_tables(
    buf: list[str],
    tables: list[dict[str, Any]],
    columns_by_table: dict[str, list[dict[str, Any]]],
    constraints_by_table: dict[str, list[dict[str, Any]]],
) -> None:
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Tables (public)")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for t in tables:
        name = t["name"]
        buf.append(f"create table if not exists public.{quote_ident(name)} (")
        parts: list[str] = []
        for col in columns_by_table[name]:
            frag = f"    {quote_ident(col['name'])} {col['data_type']}"
            if col.get("default_expr"):
                frag += f" default {col['default_expr']}"
            if col["not_null"]:
                frag += " not null"
            parts.append(frag)
        for con in constraints_by_table[name]:
            parts.append(f"    constraint {quote_ident(con['name'])} {con['definition']}")
        buf.append(",\n".join(parts))
        buf.append(");")
        if t.get("comment"):
            buf.append(
                f"comment on table public.{quote_ident(name)} is {sql_literal(t['comment'])};"
            )
        for col in columns_by_table[name]:
            if col.get("comment"):
                buf.append(
                    f"comment on column public.{quote_ident(name)}.{quote_ident(col['name'])} "
                    f"is {sql_literal(col['comment'])};"
                )
        buf.append("")


def emit_foreign_keys(buf: list[str], fks: list[dict[str, Any]]) -> None:
    if not fks:
        return
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Foreign keys")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for fk in fks:
        buf.append(
            f"alter table public.{quote_ident(fk['table_name'])} "
            f"add constraint {quote_ident(fk['name'])} {fk['definition']};"
        )
    buf.append("")


def emit_sequences_create_only(
    buf: list[str], sequences: list[dict[str, Any]]
) -> None:
    if not sequences:
        return
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Sequences (created before tables; owned-by links emitted later)")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for s in sequences:
        lines = [f"create sequence if not exists public.{quote_ident(s['name'])}"]
        if s.get("data_type"):
            lines.append(f"    as {s['data_type']}")
        if s.get("start_value") is not None:
            lines.append(f"    start with {s['start_value']}")
        if s.get("increment_by") is not None:
            lines.append(f"    increment by {s['increment_by']}")
        if s.get("min_value") is not None:
            lines.append(f"    minvalue {s['min_value']}")
        if s.get("max_value") is not None:
            lines.append(f"    maxvalue {s['max_value']}")
        if s.get("cache_size") is not None:
            lines.append(f"    cache {s['cache_size']}")
        if s.get("cycle"):
            lines.append("    cycle")
        buf.append("\n".join(lines) + ";")
    buf.append("")


def emit_sequences_owned_by(
    buf: list[str], sequences: list[dict[str, Any]]
) -> None:
    owned = [s for s in sequences if s.get("owned_by")]
    if not owned:
        return
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Sequence ownership (ALTER ... OWNED BY)")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for s in owned:
        buf.append(
            f"alter sequence public.{quote_ident(s['name'])} owned by {s['owned_by']};"
        )
    buf.append("")


def emit_indexes(buf: list[str], indexes: list[dict[str, Any]]) -> None:
    if not indexes:
        return
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Indexes (non-constraint)")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for idx in indexes:
        definition = idx["definition"]
        # Make idempotent.
        if definition.startswith("CREATE UNIQUE INDEX "):
            definition = definition.replace(
                "CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", 1
            )
        elif definition.startswith("CREATE INDEX "):
            definition = definition.replace(
                "CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", 1
            )
        buf.append(definition + ";")
    buf.append("")


def emit_functions(buf: list[str], functions: list[dict[str, Any]]) -> None:
    if not functions:
        return
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Functions (public, excluding extension-owned)")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for f in functions:
        buf.append(f"-- Function: public.{f['name']}({f['args']})")
        definition = f["definition"].rstrip()
        if not definition.endswith(";"):
            definition += ";"
        buf.append(definition)
        buf.append("")


def emit_triggers(buf: list[str], triggers: list[dict[str, Any]]) -> None:
    if not triggers:
        return
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Triggers")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for t in triggers:
        # pg_get_triggerdef returns "CREATE TRIGGER ..."; make idempotent by
        # wrapping in a DO block that drops first.
        buf.append(f"drop trigger if exists {quote_ident(t['name'])} on public.{quote_ident(t['table_name'])};")
        definition = t["definition"].rstrip()
        if not definition.endswith(";"):
            definition += ";"
        buf.append(definition)
    buf.append("")


def emit_views(buf: list[str], views: list[dict[str, Any]]) -> None:
    if not views:
        return
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Views")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for v in views:
        definition = v["definition"].rstrip().rstrip(";")
        buf.append(f"create or replace view public.{quote_ident(v['name'])} as")
        buf.append(definition + ";")
        buf.append("")


def emit_materialized_views(buf: list[str], matviews: list[dict[str, Any]]) -> None:
    if not matviews:
        return
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Materialized views")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for v in matviews:
        definition = v["definition"].rstrip().rstrip(";")
        buf.append(
            f"create materialized view if not exists public.{quote_ident(v['name'])} as"
        )
        buf.append(definition)
        buf.append("with no data;")
        buf.append("")


def emit_rls(
    buf: list[str],
    tables: list[dict[str, Any]],
    policies: list[dict[str, Any]],
) -> None:
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Row Level Security -- enable flags + policies (captured AS-IS)")
    buf.append("-- WARNING: permissive policies below preserved from prod; dropped")
    buf.append("--   in 20260409120100_rls_lockdown.sql.")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    for t in tables:
        if t.get("rls_enabled"):
            buf.append(
                f"alter table public.{quote_ident(t['name'])} enable row level security;"
            )
        if t.get("rls_forced"):
            buf.append(
                f"alter table public.{quote_ident(t['name'])} force row level security;"
            )
    buf.append("")
    for p in policies:
        name = p["policyname"]
        table = p["tablename"]
        permissive = (p.get("permissive") or "PERMISSIVE").lower()
        cmd = (p.get("cmd") or "ALL").upper()
        cmd_map = {
            "ALL": "all",
            "SELECT": "select",
            "INSERT": "insert",
            "UPDATE": "update",
            "DELETE": "delete",
        }
        cmd_sql = cmd_map.get(cmd, cmd.lower())
        roles = _parse_pg_text_array(p.get("roles"))
        roles_sql = (
            ", ".join(quote_ident(r) if r != "public" else "public" for r in roles)
            or "public"
        )
        parts = [
            f"create policy {quote_ident(name)} on public.{quote_ident(table)}",
            f"    as {permissive}",
            f"    for {cmd_sql}",
            f"    to {roles_sql}",
        ]
        if p.get("qual"):
            parts.append(f"    using ({p['qual']})")
        if p.get("with_check"):
            parts.append(f"    with check ({p['with_check']})")
        buf.append("-- permissive policy preserved from prod; dropped by rls_lockdown migration")
        buf.append("do $$ begin")
        buf.append("  " + "\n  ".join(parts) + ";")
        buf.append("exception when duplicate_object then null;")
        buf.append("end $$;")
    buf.append("")


def emit_grants(
    buf: list[str],
    table_grants: list[dict[str, Any]],
    function_grants: list[dict[str, Any]],
) -> None:
    if not table_grants and not function_grants:
        return
    buf.append("-- ---------------------------------------------------------------")
    buf.append("-- Grants (captured AS-IS; revoked by revoke_anon_grants migration)")
    buf.append("-- ---------------------------------------------------------------")
    buf.append("")
    # Group table grants by (table, grantee) to collapse privileges.
    from collections import defaultdict

    grouped_tables: dict[tuple[str, str], list[str]] = defaultdict(list)
    for g in table_grants:
        grouped_tables[(g["table_name"], g["grantee"])].append(g["privilege_type"])
    for (table, grantee), privs in sorted(grouped_tables.items()):
        privs_sql = ", ".join(sorted(set(privs)))
        buf.append(
            f"grant {privs_sql} on public.{quote_ident(table)} to {quote_ident(grantee) if grantee != 'public' else 'public'};"
        )
    buf.append("")
    # Function grants: keyed by (name, args, grantee) so overloads are
    # disambiguated. Only user-defined functions are queried (extension
    # functions are filtered server-side) and only EXECUTE is emitted.
    grouped_funcs: dict[tuple[str, str, str], list[str]] = defaultdict(list)
    for g in function_grants:
        key = (g["routine_name"], g.get("args", ""), g["grantee"])
        grouped_funcs[key].append(g["privilege_type"])
    if grouped_funcs:
        buf.append("-- Function grants (user-defined functions only; extension-owned")
        buf.append("-- functions are excluded). Revoked en masse by the next migration.")
        for (fname, fargs, grantee), privs in sorted(grouped_funcs.items()):
            if "EXECUTE" not in privs:
                continue
            grantee_sql = (
                quote_ident(grantee) if grantee != "public" else "public"
            )
            buf.append(
                f"grant execute on function public.{quote_ident(fname)}({fargs}) "
                f"to {grantee_sql};"
            )
        buf.append("")


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def build_baseline(project_ref: str, token: str) -> tuple[str, dict[str, int]]:
    buf: list[str] = []
    emit_header(buf, project_ref)

    exts = get_extensions(project_ref, token)
    emit_extensions(buf, exts)

    schemas = get_custom_schemas(project_ref, token)
    emit_schemas(buf, schemas)

    enums = get_enums(project_ref, token)
    emit_enums(buf, enums)

    # Sequences must be created BEFORE tables that reference them via
    # nextval('...') in column defaults. The "owned_by" linkage is emitted
    # afterwards so it can reference the (then-existing) column.
    sequences = get_sequences(project_ref, token)
    emit_sequences_create_only(buf, sequences)

    tables = get_tables(project_ref, token)
    columns_by_table: dict[str, list[dict[str, Any]]] = {}
    constraints_by_table: dict[str, list[dict[str, Any]]] = {}
    for t in tables:
        columns_by_table[t["name"]] = get_columns(project_ref, token, t["name"])
        constraints_by_table[t["name"]] = get_table_constraints(
            project_ref, token, t["name"]
        )
    emit_tables(buf, tables, columns_by_table, constraints_by_table)

    fks = get_foreign_keys(project_ref, token)
    emit_foreign_keys(buf, fks)

    emit_sequences_owned_by(buf, sequences)

    indexes = get_indexes(project_ref, token)
    emit_indexes(buf, indexes)

    functions = get_functions(project_ref, token)
    emit_functions(buf, functions)

    triggers = get_triggers(project_ref, token)
    emit_triggers(buf, triggers)

    views = get_views(project_ref, token)
    emit_views(buf, views)

    matviews = get_materialized_views(project_ref, token)
    emit_materialized_views(buf, matviews)

    policies = get_policies(project_ref, token)
    emit_rls(buf, tables, policies)

    table_grants = get_table_grants(project_ref, token)
    function_grants = get_function_grants(project_ref, token)
    emit_grants(buf, table_grants, function_grants)

    counts = {
        "extensions": len([e for e in exts if e["name"] not in SKIP_EXTENSIONS]),
        "schemas": len(schemas),
        "enums": len(enums),
        "tables": len(tables),
        "columns": sum(len(c) for c in columns_by_table.values()),
        "foreign_keys": len(fks),
        "sequences": len(sequences),
        "indexes": len(indexes),
        "functions": len(functions),
        "triggers": len(triggers),
        "views": len(views),
        "materialized_views": len(matviews),
        "policies": len(policies),
        "table_grants": len(table_grants),
        "function_grants": len(function_grants),
    }
    return "\n".join(buf) + "\n", counts


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--project-ref",
        default="bugpetfkyoraidyxmzxu",
        help="Supabase project ref (default: production cartório)",
    )
    p.add_argument(
        "--out",
        default=None,
        help="Output SQL file path. If omitted, writes to stdout.",
    )
    p.add_argument(
        "--counts-only",
        action="store_true",
        help="Only print object counts from prod; do not emit SQL.",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        print("error: SUPABASE_ACCESS_TOKEN is not set", file=sys.stderr)
        return 2
    try:
        sql, counts = build_baseline(args.project_ref, token)
    except ApiError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.counts_only:
        for k, v in counts.items():
            print(f"{k}: {v}")
        return 0

    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(sql)
        print(f"wrote {args.out} ({len(sql)} bytes)", file=sys.stderr)
        for k, v in counts.items():
            print(f"  {k}: {v}", file=sys.stderr)
    else:
        sys.stdout.write(sql)
    return 0


if __name__ == "__main__":
    sys.exit(main())
