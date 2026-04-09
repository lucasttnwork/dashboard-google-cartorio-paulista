-- 20260409231944_user_profiles.sql
-- Phase 1 Auth & BFF — user_profiles table with RLS lockdown
-- Author: JARVIS
-- Date: 2026-04-09
-- Source: .planning/enterprise-rebuild/phase-1-auth-bff/SPEC.md §3.6
-- Task: T1.W2.1
-- Depends on: 20260409120400_consolidate_location_id.sql (last Phase 0 migration)
-- Effect: creates public.user_profiles, triggers updated_at, enables RLS default-deny,
--         revokes all grants from anon/authenticated/public.
-- Down: none (destructive); restore from prod backup if needed.

-- Section 1 — Create table.
create table public.user_profiles (
    user_id    uuid        primary key references auth.users(id) on delete cascade,
    role       text        not null check (role in ('admin', 'manager', 'viewer')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    disabled_at timestamptz
);

comment on table public.user_profiles is 'BFF-side role assignment for users in auth.users. Read by backend via service_role only.';

-- Section 2 — Partial index for active (non-disabled) users by role.
create index user_profiles_role_idx on public.user_profiles (role) where disabled_at is null;

-- Section 3 — Trigger function to auto-update updated_at on every row update.
create or replace function public.user_profiles_set_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger user_profiles_updated_at
    before update on public.user_profiles
    for each row
    execute function public.user_profiles_set_updated_at();

-- Section 4 — Enable and FORCE row level security.
alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;

-- Section 5 — Install default-deny RESTRICTIVE policy.
-- No PERMISSIVE policy exists alongside, so this blocks all access.
-- service_role bypasses RLS via bypass_rls role setting, not through any policy.
create policy user_profiles_deny_all on public.user_profiles
    as restrictive
    for all
    to public
    using (false)
    with check (false);

-- Section 6 — Revoke all direct grants from anon, authenticated, and public.
revoke all on public.user_profiles from anon, authenticated, public;
revoke execute on function public.user_profiles_set_updated_at() from anon, authenticated, public;
