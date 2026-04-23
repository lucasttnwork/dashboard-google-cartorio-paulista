-- Allow 'backfill' as a run_type on collection_runs.
-- The collector now distinguishes scheduled cron runs from manual/backfill
-- enqueues that override the rolling fetch window. Without this value the
-- INSERT into collection_runs at the end of a backfill run aborts with
-- CheckViolationError, losing the audit row even though the upsert into
-- reviews already committed (observed 2026-04-23 on batch
-- 1e43ed58-5588-40d6-a43b-47d7eb3e9c16).

ALTER TABLE public.collection_runs
    DROP CONSTRAINT IF EXISTS collection_runs_run_type_check;

ALTER TABLE public.collection_runs
    ADD CONSTRAINT collection_runs_run_type_check
    CHECK (run_type = ANY (ARRAY['manual'::text, 'scheduled'::text, 'webhook'::text, 'backfill'::text]));
