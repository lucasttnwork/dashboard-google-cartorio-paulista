-- 20260409120400_consolidate_location_id.sql
-- Phase 0 Security Baseline — consolidate dual location_id values into canonical
-- Source: .planning/enterprise-rebuild/phase-0-security-baseline/SPEC.md §3.6
-- Depends on: 20260409120000_baseline.sql
-- Effect:
--   * ensure 'cartorio-paulista-location' row exists in gbp_locations (copied from legacy if missing)
--   * UPDATE reviews/reviews_raw/collection_runs set location_id = canonical where = legacy
--   * DELETE gbp_locations row 'cartorio_paulista_main' after all references migrated
-- Expected: 4421 reviews reassociated → single location_id 'cartorio-paulista-location' with 5372 total rows
-- Down: reverse UPDATE (lossy for rows added after migration); restore from backup if needed.

begin;

-- Section 1 — Ensure canonical row exists in gbp_locations
-- If canonical row missing, clone from legacy row preserving account linkage and identity fields.
-- gbp_locations columns (from baseline): location_id (PK), account_id, name, title, place_id, cid,
-- website, address, phone, domain, last_review_sync, total_reviews_count, current_rating,
-- is_monitoring_active, sync_frequency_hours, metrics_last_updated.
-- Only location_id is NOT NULL; we clone the descriptive identity fields and leave metrics to
-- recompute naturally post-migration.
insert into public.gbp_locations (location_id, account_id, name, title)
select 'cartorio-paulista-location', account_id, name, title
from public.gbp_locations
where location_id = 'cartorio_paulista_main'
  and not exists (
    select 1 from public.gbp_locations where location_id = 'cartorio-paulista-location'
  )
on conflict (location_id) do nothing;

-- Section 2 — Reassociate referencing rows from legacy to canonical location_id

-- Reviews table (expected: 4421 rows affected)
update public.reviews
   set location_id = 'cartorio-paulista-location'
 where location_id = 'cartorio_paulista_main';

-- Reviews raw payloads
update public.reviews_raw
   set location_id = 'cartorio-paulista-location'
 where location_id = 'cartorio_paulista_main';

-- Collection runs (table present in baseline but guarded for safety in staging variants)
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'collection_runs') then
    update public.collection_runs
       set location_id = 'cartorio-paulista-location'
     where location_id = 'cartorio_paulista_main';
  end if;
end $$;

-- Monitoring config (PK on location_id; only reassociate if no canonical row exists to avoid PK conflict)
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'monitoring_config') then
    update public.monitoring_config
       set location_id = 'cartorio-paulista-location'
     where location_id = 'cartorio_paulista_main'
       and not exists (
         select 1 from public.monitoring_config where location_id = 'cartorio-paulista-location'
       );
  end if;
end $$;

-- Section 3 — Delete obsolete gbp_locations row
-- Any residual dependent rows (e.g. monitoring_config duplicate) will cascade via ON DELETE CASCADE.
-- If a FK violation occurs, a dependent table still references the legacy value — diagnose before prod.
delete from public.gbp_locations where location_id = 'cartorio_paulista_main';

-- Section 4 — Sanity check (non-fatal notice)
do $$
declare
  canonical_count bigint;
  legacy_count bigint;
begin
  select count(*) into canonical_count from public.reviews where location_id = 'cartorio-paulista-location';
  select count(*) into legacy_count from public.reviews where location_id = 'cartorio_paulista_main';
  raise notice 'consolidate_location_id: canonical=%, legacy=% (legacy should be 0 after apply)', canonical_count, legacy_count;
end $$;

commit;
