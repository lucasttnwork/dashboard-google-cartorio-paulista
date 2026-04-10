# Post-Bootstrap Snapshot — 2026-04-10

## Migration user_profiles applied

- **Table:** `public.user_profiles` — 5 columns (user_id UUID PK, role TEXT, created_at, updated_at, disabled_at)
- **RLS:** enabled + forced
- **Policy:** `user_profiles_deny_all` RESTRICTIVE ALL `using(false) with check(false)`
- **Grants revoked:** anon, authenticated, public
- **Index:** `user_profiles_role_idx` partial on role WHERE disabled_at IS NULL
- **Trigger:** `user_profiles_updated_at` BEFORE UPDATE → `user_profiles_set_updated_at()`

## Admin bootstrapped

- **user_profiles count:** 1
- **Role:** admin
- **Created at:** 2026-04-10 13:24:20 UTC
- **Idempotency verified:** second upsert updated `updated_at` only, count remained 1

## Total tables in public schema

15 (14 from Phase 0 + 1 user_profiles from Phase 1)

## Total RLS policies

15 deny_all RESTRICTIVE (one per table, all `using(false)`)
