-- 20260409120100_rls_lockdown.sql
-- Phase 0 Security Baseline — RLS default-deny lockdown for public schema
-- Source: .planning/enterprise-rebuild/phase-0-security-baseline/SPEC.md §3.3
-- Depends on: 20260409120000_baseline.sql
-- Effect: drops all public policies, enables+forces RLS, installs <table>_deny_all RESTRICTIVE policy,
--         revokes all direct grants from anon/authenticated. service_role bypasses RLS natively.
-- Down: none (destructive for permissive policies); restore from prod backup if needed.

-- Section 1 — Drop every existing policy in the public schema.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I;', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Section 2 — Enable and FORCE row level security on every public table.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
    execute format('alter table public.%I force row level security;', r.tablename);
  end loop;
end $$;

-- Section 3 — Install a default-deny RESTRICTIVE policy on every public table.
-- With no PERMISSIVE policy alongside, a RESTRICTIVE policy whose USING is false blocks all access.
-- service_role bypasses RLS via the bypass_rls role setting, not through any policy.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'create policy %I on public.%I as restrictive for all to public using (false) with check (false);',
      r.tablename || '_deny_all', r.tablename
    );
  end loop;
end $$;

-- Section 4 — Revoke all direct grants on public tables from anon and authenticated.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke all on public.%I from anon, authenticated;', r.tablename);
  end loop;
end $$;
