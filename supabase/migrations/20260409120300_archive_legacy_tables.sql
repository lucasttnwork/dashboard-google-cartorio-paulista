-- 20260409120300_archive_legacy_tables.sql
-- Phase 0 Security Baseline — isolate legacy backup tables into archive schema
-- Source: .planning/enterprise-rebuild/phase-0-security-baseline/SPEC.md §3.5
-- Depends on: 20260409120000_baseline.sql
-- Effect:
--   * create schema 'archive' with default-deny RLS
--   * relocate 4 legacy tables (reviews_backup_cp, review_collaborators_backup_cp,
--     reviews_legacy_archive, reviews_raw_legacy_archive) from public → archive
--   * revoke all access from anon/authenticated/public
--   * DO NOT drop — ≥90 days retention before deletion decision (documented in SPEC §3.5)
-- Down: alter schema back to public (lossy if staging lacks the tables; use `if exists`)

-- Section 1 — Create archive schema and lock it down
create schema if not exists archive;
revoke all on schema archive from public;
revoke all on schema archive from anon;
revoke all on schema archive from authenticated;
grant usage on schema archive to service_role;

-- Section 2 — Relocate the 4 legacy tables from public to archive
-- Guarded with `if exists` so staging/dev projects missing these tables do not fail
do $$
declare
  t text;
begin
  foreach t in array array[
    'reviews_backup_cp',
    'review_collaborators_backup_cp',
    'reviews_legacy_archive',
    'reviews_raw_legacy_archive'
  ]
  loop
    if exists (
      select 1 from pg_tables
      where schemaname = 'public' and tablename = t
    ) then
      execute format('alter table public.%I set schema archive', t);
    end if;
  end loop;
end
$$;

-- Section 3 — Apply RLS default-deny on every table now living in archive
do $$
declare
  r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'archive'
  loop
    execute format('alter table archive.%I enable row level security', r.tablename);
    execute format('alter table archive.%I force row level security', r.tablename);
    execute format(
      'create policy %I on archive.%I as restrictive for all to public using (false) with check (false)',
      r.tablename || '_deny_all', r.tablename
    );
    execute format('revoke all on archive.%I from anon', r.tablename);
    execute format('revoke all on archive.%I from authenticated', r.tablename);
    execute format('revoke all on archive.%I from public', r.tablename);
  end loop;
end
$$;
