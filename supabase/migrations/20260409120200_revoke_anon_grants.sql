-- 20260409120200_revoke_anon_grants.sql
-- Phase 0 Security Baseline — revoke execute from anon/authenticated on public functions
-- Source: .planning/enterprise-rebuild/phase-0-security-baseline/SPEC.md §3.4
-- Depends on: 20260409120000_baseline.sql
-- Effect: closes active attack vectors where anon/authenticated roles could invoke write RPCs
--         (persist_reviews_atomic, update_location_metrics, refresh_monthly_view,
--          cleanup_legacy_from_dataset, reprocess_reviews_for_collaborator, create_auto_alerts,
--          process_collaborator_mentions, enqueue_*, claim_nlp_review, complete_nlp_review,
--          fail_nlp_review) plus all read RPCs.
-- service_role retains execute (used by backend/workers). Subsequent phases may re-grant
-- specific functions to 'authenticated' for BFF-less endpoints if needed.
-- Down: none; re-granting would require re-discovery of original grant set from baseline.

-- Section 1 — Revoke execute on every user-defined function in public schema.
-- Extension-owned functions (pg_trgm, vector, unaccent, etc.) are skipped via pg_depend deptype='e'.
do $$
declare f record;
begin
  for f in
    select p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'revoke execute on function public.%I(%s) from anon, authenticated, public;',
      f.proname, f.args
    );
  end loop;
end $$;

-- Section 2 — Revoke direct access to aggregated monthly view.
-- Wrapped in existence guard so fresh staging targets without mv_monthly do not hard-fail.
do $$
begin
  if exists (
    select 1 from pg_matviews where schemaname = 'public' and matviewname = 'mv_monthly'
  ) then
    execute 'revoke all on public.mv_monthly from anon, authenticated';
  end if;
end $$;

-- Section 3 — Critical write RPCs closed by this migration (documentation for auditors):
--   persist_reviews_atomic, update_location_metrics, refresh_monthly_view,
--   cleanup_legacy_from_dataset, reprocess_reviews_for_collaborator,
--   create_auto_alerts, process_collaborator_mentions,
--   enqueue_review_collaborator_job, enqueue_collaborator_refresh_job, enqueue_nlp_review,
--   claim_nlp_review, complete_nlp_review, fail_nlp_review
