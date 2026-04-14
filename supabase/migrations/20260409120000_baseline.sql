-- 20260409120000_baseline.sql
-- Phase 0 Security Baseline -- captured from production 2026-04-09
-- Source: Supabase project bugpetfkyoraidyxmzxu (Free plan)
-- Extraction: backend/scripts/export_schema.py via Management API
-- Down: none (baseline); see subsequent migrations 20260409120100..400
--   for layered changes (rls_lockdown, revoke_anon_grants,
--   archive_legacy_tables, consolidate_location_id).
-- NOTE: includes existing permissive RLS policies AS-IS; they are
--   dropped in 20260409120100_rls_lockdown.sql.
-- NOTE: grants to anon/authenticated are preserved AS-IS; they are
--   revoked in 20260409120200_revoke_anon_grants.sql.

-- ---------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------

create extension if not exists "pg_graphql" with schema "graphql";
create extension if not exists "pg_stat_statements" with schema "extensions";
create extension if not exists "pg_trgm" with schema "public";
create extension if not exists "pgcrypto" with schema "extensions";
create extension if not exists "supabase_vault" with schema "vault";
create extension if not exists "unaccent" with schema "public";
create extension if not exists "uuid-ossp" with schema "extensions";
create extension if not exists "vector" with schema "public";

-- ---------------------------------------------------------------
-- Enum types (public)
-- ---------------------------------------------------------------

do $$ begin
  create type public."review_collaborator_job_status" as enum ('pending', 'processing', 'completed', 'failed');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."review_collaborator_job_type" as enum ('review', 'collaborator');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public."review_sentiment" as enum ('pos', 'neu', 'neg', 'unknown');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------
-- Sequences (created before tables; owned-by links emitted later)
-- ---------------------------------------------------------------

create sequence if not exists public."collaborators_id_seq"
    as bigint
    start with 1
    increment by 1
    minvalue 1
    maxvalue 9223372036854775807
    cache 1;
create sequence if not exists public."collection_runs_id_seq"
    as bigint
    start with 1
    increment by 1
    minvalue 1
    maxvalue 9223372036854775807
    cache 1;
create sequence if not exists public."nlp_queue_id_seq"
    as bigint
    start with 1
    increment by 1
    minvalue 1
    maxvalue 9223372036854775807
    cache 1;
create sequence if not exists public."review_alerts_id_seq"
    as bigint
    start with 1
    increment by 1
    minvalue 1
    maxvalue 9223372036854775807
    cache 1;
create sequence if not exists public."review_collaborator_jobs_id_seq"
    as bigint
    start with 1
    increment by 1
    minvalue 1
    maxvalue 9223372036854775807
    cache 1;
create sequence if not exists public."services_id_seq"
    as bigint
    start with 1
    increment by 1
    minvalue 1
    maxvalue 9223372036854775807
    cache 1;

-- ---------------------------------------------------------------
-- Tables (public)
-- ---------------------------------------------------------------

create table if not exists public."collaborators" (
    "id" bigint default nextval('collaborators_id_seq'::regclass) not null,
    "full_name" text,
    "aliases" text[] default '{}'::text[],
    "department" text default 'E-notariado'::text,
    "position" text,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    constraint "collaborators_pkey" PRIMARY KEY (id),
    constraint "collaborators_full_name_key" UNIQUE (full_name)
);

create table if not exists public."collection_runs" (
    "id" bigint default nextval('collection_runs_id_seq'::regclass) not null,
    "location_id" text,
    "run_type" text not null,
    "status" text default 'running'::text not null,
    "started_at" timestamp with time zone default now() not null,
    "completed_at" timestamp with time zone,
    "reviews_found" integer default 0,
    "reviews_new" integer default 0,
    "reviews_updated" integer default 0,
    "error_message" text,
    "execution_time_ms" integer,
    "api_cost" numeric(10,4) default 0.0,
    "metadata" jsonb,
    "ended_at" timestamp with time zone default now(),
    constraint "collection_runs_run_type_check" CHECK ((run_type = ANY (ARRAY['manual'::text, 'scheduled'::text, 'webhook'::text]))),
    constraint "collection_runs_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text]))),
    constraint "collection_runs_pkey" PRIMARY KEY (id)
);

create table if not exists public."gbp_accounts" (
    "account_id" text not null,
    "display_name" text,
    constraint "gbp_accounts_pkey" PRIMARY KEY (account_id)
);

create table if not exists public."gbp_locations" (
    "location_id" text not null,
    "account_id" text,
    "name" text,
    "title" text,
    "place_id" text,
    "cid" text,
    "website" text,
    "address" text,
    "phone" text,
    "domain" text,
    "last_review_sync" timestamp with time zone,
    "total_reviews_count" integer default 0,
    "current_rating" numeric(3,2),
    "is_monitoring_active" boolean default true,
    "sync_frequency_hours" integer default 6,
    "metrics_last_updated" timestamp with time zone default now(),
    constraint "gbp_locations_pkey" PRIMARY KEY (location_id),
    constraint "gbp_locations_cid_key" UNIQUE (cid),
    constraint "gbp_locations_place_id_key" UNIQUE (place_id)
);

create table if not exists public."monitoring_config" (
    "location_id" text not null,
    "auto_collection_enabled" boolean default true,
    "collection_frequency_hours" integer default 6,
    "alert_on_new_review" boolean default true,
    "alert_on_negative_review" boolean default true,
    "alert_rating_threshold" integer default 3,
    "webhook_url" text,
    "last_modified" timestamp with time zone default now(),
    constraint "monitoring_config_pkey" PRIMARY KEY (location_id)
);

create table if not exists public."nlp_queue" (
    "id" bigint default nextval('nlp_queue_id_seq'::regclass) not null,
    "review_id" text,
    "status" text default 'pending'::text not null,
    "attempts" integer default 0 not null,
    "available_at" timestamp with time zone default now() not null,
    "locked_by" text,
    "locked_at" timestamp with time zone,
    "last_error" text,
    "created_at" timestamp with time zone default now() not null,
    "updated_at" timestamp with time zone default now() not null,
    constraint "nlp_queue_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'failed'::text]))),
    constraint "nlp_queue_pkey" PRIMARY KEY (id)
);

create table if not exists public."review_alerts" (
    "id" bigint default nextval('review_alerts_id_seq'::regclass) not null,
    "review_id" text,
    "alert_type" text not null,
    "sent_at" timestamp with time zone default now() not null,
    "channel" text default 'slack'::text,
    "payload" jsonb,
    constraint "review_alerts_alert_type_check" CHECK ((alert_type = ANY (ARRAY['low_rating'::text, 'negative_sentiment'::text]))),
    constraint "review_alerts_pkey" PRIMARY KEY (id),
    constraint "review_alerts_review_id_alert_type_key" UNIQUE (review_id, alert_type)
);

create table if not exists public."review_collaborator_jobs" (
    "id" bigint default nextval('review_collaborator_jobs_id_seq'::regclass) not null,
    "job_type" review_collaborator_job_type not null,
    "job_status" review_collaborator_job_status default 'pending'::review_collaborator_job_status not null,
    "review_id" text,
    "collaborator_id" bigint,
    "comment" text,
    "scheduled_at" timestamp with time zone default now() not null,
    "attempt_count" integer default 0 not null,
    "last_error" text,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone default now() not null,
    "updated_at" timestamp with time zone default now() not null,
    constraint "review_collaborator_jobs_pkey" PRIMARY KEY (id),
    constraint "uq_review_collaborator_jobs_type_review" UNIQUE (job_type, review_id)
);

create table if not exists public."review_collaborators" (
    "review_id" text not null,
    "collaborator_id" bigint not null,
    "mention_snippet" text,
    "match_score" real,
    "context_found" text,
    constraint "review_collaborators_match_score_check" CHECK (((match_score >= (0)::double precision) AND (match_score <= (1)::double precision))),
    constraint "review_collaborators_pkey" PRIMARY KEY (review_id, collaborator_id)
);

create table if not exists public."review_collaborators_backup_cp" (
    "review_id" text not null,
    "collaborator_id" bigint not null,
    "mention_snippet" text,
    "match_score" real,
    "context_found" text,
    constraint "review_collaborators_match_score_check" CHECK (((match_score >= (0)::double precision) AND (match_score <= (1)::double precision))),
    constraint "review_collaborators_backup_cp_pkey" PRIMARY KEY (review_id, collaborator_id)
);

create table if not exists public."review_labels" (
    "review_id" text not null,
    "sentiment" review_sentiment default 'unknown'::review_sentiment,
    "toxicity" real,
    "is_enotariado" boolean default false,
    "classifier_version" text,
    constraint "review_labels_pkey" PRIMARY KEY (review_id)
);

create table if not exists public."review_services" (
    "review_id" text not null,
    "service_id" bigint not null,
    "confidence" real,
    constraint "review_services_confidence_check" CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    constraint "review_services_pkey" PRIMARY KEY (review_id, service_id)
);

create table if not exists public."reviews" (
    "review_id" text not null,
    "location_id" text,
    "rating" integer,
    "comment" text,
    "reviewer_name" text,
    "is_anonymous" boolean,
    "create_time" timestamp with time zone,
    "update_time" timestamp with time zone,
    "reply_text" text,
    "reply_time" timestamp with time zone,
    "tsv" tsvector,
    "collection_source" text default 'manual'::text,
    "collection_batch_id" text,
    "processed_at" timestamp with time zone,
    "last_checked_at" timestamp with time zone default now(),
    "review_url" text,
    "reviewer_id" text,
    "reviewer_url" text,
    "is_local_guide" boolean,
    "reviewer_photo_url" text,
    "original_language" text,
    "translated_text" text,
    "response_text" text,
    "response_time" timestamp with time zone,
    "source" text default 'apify'::text,
    "last_seen_at" timestamp with time zone,
    constraint "reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))),
    constraint "reviews_pkey" PRIMARY KEY (review_id)
);

create table if not exists public."reviews_backup_cp" (
    "review_id" text not null,
    "location_id" text,
    "rating" integer,
    "comment" text,
    "reviewer_name" text,
    "is_anonymous" boolean,
    "create_time" timestamp with time zone,
    "update_time" timestamp with time zone,
    "reply_text" text,
    "reply_time" timestamp with time zone,
    "tsv" tsvector,
    "collection_source" text default 'manual'::text,
    "collection_batch_id" text,
    "processed_at" timestamp with time zone,
    "last_checked_at" timestamp with time zone default now(),
    constraint "reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))),
    constraint "reviews_backup_cp_pkey" PRIMARY KEY (review_id)
);

create table if not exists public."reviews_legacy_archive" (
    "review_id" text not null,
    "location_id" text,
    "rating" integer,
    "comment" text,
    "reviewer_name" text,
    "is_anonymous" boolean,
    "create_time" timestamp with time zone,
    "update_time" timestamp with time zone,
    "reply_text" text,
    "reply_time" timestamp with time zone,
    "tsv" tsvector,
    "collection_source" text default 'manual'::text,
    "collection_batch_id" text,
    "processed_at" timestamp with time zone,
    "last_checked_at" timestamp with time zone default now(),
    "review_url" text,
    "reviewer_id" text,
    "reviewer_url" text,
    "is_local_guide" boolean,
    "reviewer_photo_url" text,
    "original_language" text,
    "translated_text" text,
    "response_text" text,
    "response_time" timestamp with time zone,
    "source" text default 'apify'::text,
    constraint "reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))),
    constraint "reviews_legacy_archive_pkey" PRIMARY KEY (review_id)
);

create table if not exists public."reviews_raw" (
    "review_id" text not null,
    "location_id" text,
    "payload" jsonb not null,
    "received_at" timestamp with time zone default now(),
    "last_seen_at" timestamp with time zone,
    "raw_payload" jsonb,
    constraint "reviews_raw_pkey" PRIMARY KEY (review_id)
);

create table if not exists public."reviews_raw_legacy_archive" (
    "review_id" text not null,
    "location_id" text,
    "payload" jsonb not null,
    "received_at" timestamp with time zone default now(),
    constraint "reviews_raw_legacy_archive_pkey" PRIMARY KEY (review_id)
);

create table if not exists public."services" (
    "id" bigint default nextval('services_id_seq'::regclass) not null,
    "name" text,
    "synonyms" text[] default '{}'::text[],
    constraint "services_pkey" PRIMARY KEY (id),
    constraint "services_name_key" UNIQUE (name)
);

-- ---------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------

alter table public."collection_runs" add constraint "collection_runs_location_id_fkey" FOREIGN KEY (location_id) REFERENCES gbp_locations(location_id) ON DELETE CASCADE;
alter table public."gbp_locations" add constraint "gbp_locations_account_id_fkey" FOREIGN KEY (account_id) REFERENCES gbp_accounts(account_id) ON DELETE CASCADE;
alter table public."monitoring_config" add constraint "monitoring_config_location_id_fkey" FOREIGN KEY (location_id) REFERENCES gbp_locations(location_id) ON DELETE CASCADE;
alter table public."nlp_queue" add constraint "nlp_queue_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(review_id) ON DELETE CASCADE;
alter table public."review_alerts" add constraint "review_alerts_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(review_id) ON DELETE CASCADE;
alter table public."review_collaborators" add constraint "review_collaborators_collaborator_id_fkey" FOREIGN KEY (collaborator_id) REFERENCES collaborators(id) ON DELETE CASCADE;
alter table public."review_collaborators" add constraint "review_collaborators_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(review_id) ON DELETE CASCADE;
alter table public."review_labels" add constraint "review_labels_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(review_id) ON DELETE CASCADE;
alter table public."review_services" add constraint "review_services_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(review_id) ON DELETE CASCADE;
alter table public."review_services" add constraint "review_services_service_id_fkey" FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
alter table public."reviews" add constraint "reviews_location_id_fkey" FOREIGN KEY (location_id) REFERENCES gbp_locations(location_id) ON DELETE CASCADE;
alter table public."reviews_raw" add constraint "reviews_raw_location_id_fkey" FOREIGN KEY (location_id) REFERENCES gbp_locations(location_id) ON DELETE CASCADE;

-- ---------------------------------------------------------------
-- Sequence ownership (ALTER ... OWNED BY)
-- ---------------------------------------------------------------

alter sequence public."collaborators_id_seq" owned by public.collaborators.id;
alter sequence public."collection_runs_id_seq" owned by public.collection_runs.id;
alter sequence public."nlp_queue_id_seq" owned by public.nlp_queue.id;
alter sequence public."review_alerts_id_seq" owned by public.review_alerts.id;
alter sequence public."review_collaborator_jobs_id_seq" owned by public.review_collaborator_jobs.id;
alter sequence public."services_id_seq" owned by public.services.id;

-- ---------------------------------------------------------------
-- Indexes (non-constraint)
-- ---------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_collaborators_aliases_gin ON public.collaborators USING gin (aliases);
CREATE INDEX IF NOT EXISTS idx_collaborators_full_name ON public.collaborators USING btree (full_name);
CREATE INDEX IF NOT EXISTS idx_collaborators_name_trgm ON public.collaborators USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_collection_runs_location_status ON public.collection_runs USING btree (location_id, status, started_at);
CREATE INDEX IF NOT EXISTS idx_gbp_locations_account_id ON public.gbp_locations USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_nlp_queue_created ON public.nlp_queue USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_nlp_queue_status_available ON public.nlp_queue USING btree (status, available_at);
CREATE INDEX IF NOT EXISTS idx_nlp_queue_worker ON public.nlp_queue USING btree (locked_by);
CREATE UNIQUE INDEX IF NOT EXISTS uq_nlp_queue_review ON public.nlp_queue USING btree (review_id);
CREATE INDEX IF NOT EXISTS idx_review_alerts_sent ON public.review_alerts USING btree (sent_at);
CREATE INDEX IF NOT EXISTS idx_review_alerts_type ON public.review_alerts USING btree (alert_type);
CREATE INDEX IF NOT EXISTS idx_review_collaborator_jobs_status_scheduled ON public.review_collaborator_jobs USING btree (job_status, scheduled_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_collaborator_jobs_collaborator ON public.review_collaborator_jobs USING btree (job_type, collaborator_id) WHERE (collaborator_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_collaborator_jobs_review ON public.review_collaborator_jobs USING btree (job_type, review_id) WHERE (review_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_review_collaborators_collaborator_id ON public.review_collaborators USING btree (collaborator_id);
CREATE INDEX IF NOT EXISTS review_collaborators_backup_cp_collaborator_id_idx ON public.review_collaborators_backup_cp USING btree (collaborator_id);
CREATE INDEX IF NOT EXISTS idx_review_labels_is_enotariado ON public.review_labels USING btree (is_enotariado);
CREATE INDEX IF NOT EXISTS idx_review_labels_sentiment ON public.review_labels USING btree (sentiment);
CREATE INDEX IF NOT EXISTS idx_review_services_service_id ON public.review_services USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_reviews_batch ON public.reviews USING btree (collection_batch_id) WHERE (collection_batch_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_reviews_collection_source ON public.reviews USING btree (collection_source, processed_at);
CREATE INDEX IF NOT EXISTS idx_reviews_comment_trgm ON public.reviews USING gin (comment gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_reviews_create_time ON public.reviews USING btree (create_time);
CREATE INDEX IF NOT EXISTS idx_reviews_location_rating ON public.reviews USING btree (location_id, rating);
CREATE INDEX IF NOT EXISTS idx_reviews_location_time ON public.reviews USING btree (location_id, create_time);
CREATE INDEX IF NOT EXISTS idx_reviews_location_time_rating ON public.reviews USING btree (location_id, create_time, rating);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON public.reviews USING btree (rating);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_name ON public.reviews USING btree (reviewer_name);
CREATE INDEX IF NOT EXISTS idx_reviews_tsv ON public.reviews USING gin (tsv);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_review_url_not_null ON public.reviews USING btree (review_url) WHERE (review_url IS NOT NULL);
CREATE INDEX IF NOT EXISTS reviews_backup_cp_collection_batch_id_idx ON public.reviews_backup_cp USING btree (collection_batch_id) WHERE (collection_batch_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS reviews_backup_cp_collection_source_processed_at_idx ON public.reviews_backup_cp USING btree (collection_source, processed_at);
CREATE INDEX IF NOT EXISTS reviews_backup_cp_comment_idx ON public.reviews_backup_cp USING gin (comment gin_trgm_ops);
CREATE INDEX IF NOT EXISTS reviews_backup_cp_create_time_idx ON public.reviews_backup_cp USING btree (create_time);
CREATE INDEX IF NOT EXISTS reviews_backup_cp_location_id_create_time_idx ON public.reviews_backup_cp USING btree (location_id, create_time);
CREATE INDEX IF NOT EXISTS reviews_backup_cp_location_id_create_time_rating_idx ON public.reviews_backup_cp USING btree (location_id, create_time, rating);
CREATE INDEX IF NOT EXISTS reviews_backup_cp_location_id_rating_idx ON public.reviews_backup_cp USING btree (location_id, rating);
CREATE INDEX IF NOT EXISTS reviews_backup_cp_rating_idx ON public.reviews_backup_cp USING btree (rating);
CREATE INDEX IF NOT EXISTS reviews_backup_cp_reviewer_name_idx ON public.reviews_backup_cp USING btree (reviewer_name);
CREATE INDEX IF NOT EXISTS reviews_backup_cp_tsv_idx ON public.reviews_backup_cp USING gin (tsv);
CREATE INDEX IF NOT EXISTS reviews_legacy_archive_collection_batch_id_idx ON public.reviews_legacy_archive USING btree (collection_batch_id) WHERE (collection_batch_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS reviews_legacy_archive_collection_source_processed_at_idx ON public.reviews_legacy_archive USING btree (collection_source, processed_at);
CREATE INDEX IF NOT EXISTS reviews_legacy_archive_comment_idx ON public.reviews_legacy_archive USING gin (comment gin_trgm_ops);
CREATE INDEX IF NOT EXISTS reviews_legacy_archive_create_time_idx ON public.reviews_legacy_archive USING btree (create_time);
CREATE INDEX IF NOT EXISTS reviews_legacy_archive_location_id_create_time_idx ON public.reviews_legacy_archive USING btree (location_id, create_time);
CREATE INDEX IF NOT EXISTS reviews_legacy_archive_location_id_create_time_rating_idx ON public.reviews_legacy_archive USING btree (location_id, create_time, rating);
CREATE INDEX IF NOT EXISTS reviews_legacy_archive_location_id_rating_idx ON public.reviews_legacy_archive USING btree (location_id, rating);
CREATE INDEX IF NOT EXISTS reviews_legacy_archive_rating_idx ON public.reviews_legacy_archive USING btree (rating);
CREATE UNIQUE INDEX IF NOT EXISTS reviews_legacy_archive_review_url_idx ON public.reviews_legacy_archive USING btree (review_url) WHERE (review_url IS NOT NULL);
CREATE INDEX IF NOT EXISTS reviews_legacy_archive_reviewer_name_idx ON public.reviews_legacy_archive USING btree (reviewer_name);
CREATE INDEX IF NOT EXISTS reviews_legacy_archive_tsv_idx ON public.reviews_legacy_archive USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_reviews_raw_location_id ON public.reviews_raw USING btree (location_id);
CREATE INDEX IF NOT EXISTS reviews_raw_legacy_archive_location_id_idx ON public.reviews_raw_legacy_archive USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_services_name ON public.services USING btree (name);

-- ---------------------------------------------------------------
-- Functions (public, excluding extension-owned)
-- ---------------------------------------------------------------

-- Function: public.check_column_exists(p_table_name text, p_column_name text)
CREATE OR REPLACE FUNCTION public.check_column_exists(p_table_name text, p_column_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = p_table_name 
      AND column_name = p_column_name
  );
END;
$function$;

-- Function: public.check_table_column(p_table_name text, p_column_name text)
CREATE OR REPLACE FUNCTION public.check_table_column(p_table_name text, p_column_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  ) INTO exists;

  RETURN exists;
END;
$function$;

-- Function: public.claim_nlp_review(p_worker_id text)
CREATE OR REPLACE FUNCTION public.claim_nlp_review(p_worker_id text)
 RETURNS TABLE(id bigint, review_id text, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  v_id bigint; 
  v_review text; 
  v_attempts int;
BEGIN
  SELECT id, review_id, attempts INTO v_id, v_review, v_attempts
  FROM nlp_queue
  WHERE status = 'pending' AND available_at <= now()
  ORDER BY available_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE nlp_queue
  SET status = 'processing', locked_by = p_worker_id, locked_at = now()
  WHERE id = v_id;

  RETURN QUERY SELECT v_id::bigint, v_review::text, v_attempts::int;
END $function$;

-- Function: public.cleanup_legacy_from_dataset(p_location_id text, p_ids text[], p_urls text[])
CREATE OR REPLACE FUNCTION public.cleanup_legacy_from_dataset(p_location_id text, p_ids text[], p_urls text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into reviews_legacy_archive
  select r.* from reviews r
  where (r.source <> 'apify' or r.location_id <> p_location_id)
    and not (
      (r.review_id is not null and r.review_id = any(p_ids))
      or (r.review_url is not null and r.review_url = any(p_urls))
    )
  on conflict (review_id) do nothing;

  delete from reviews r
  where (r.source <> 'apify' or r.location_id <> p_location_id)
    and not (
      (r.review_id is not null and r.review_id = any(p_ids))
      or (r.review_url is not null and r.review_url = any(p_urls))
    );

  update reviews set location_id = p_location_id where location_id <> p_location_id;
end $function$;

-- Function: public.collaborator_alias_entries(p_collaborator_id bigint)
CREATE OR REPLACE FUNCTION public.collaborator_alias_entries(p_collaborator_id bigint)
 RETURNS TABLE(alias text, is_full_name boolean)
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  return query
    select trim(full_name) as alias, true as is_full_name
    from collaborators
    where id = p_collaborator_id
      and trim(full_name) <> ''
    union
    select distinct trim(alias_value), false
    from collaborators
    cross join unnest(aliases) alias_value
    where id = p_collaborator_id
      and alias_value is not null
      and trim(alias_value) <> '';
end;
$function$;

-- Function: public.collaborator_alias_trigger()
CREATE OR REPLACE FUNCTION public.collaborator_alias_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  if not new.is_active then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    perform enqueue_collaborator_refresh_job(new.id);
    return new;
  end if;

  if TG_OP = 'UPDATE' and (
    new.full_name is distinct from old.full_name
    or new.aliases is distinct from old.aliases
  ) then
    perform enqueue_collaborator_refresh_job(new.id);
  end if;

  return new;
end;
$function$;

-- Function: public.complete_nlp_review(p_review_id text)
CREATE OR REPLACE FUNCTION public.complete_nlp_review(p_review_id text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM nlp_queue WHERE review_id = p_review_id;
$function$;

-- Function: public.create_auto_alerts()
CREATE OR REPLACE FUNCTION public.create_auto_alerts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  review_record RECORD;
BEGIN
  -- Alertas para avaliações com baixa pontuação (1-2 estrelas)
  FOR review_record IN
    SELECT 
      r.review_id,
      r.location_id,
      r.rating,
      r.comment,
      'low_rating' as alert_type
    FROM reviews r
    LEFT JOIN review_alerts ra ON r.review_id = ra.review_id AND ra.alert_type = 'low_rating'
    WHERE r.rating <= 2 
      AND ra.id IS NULL
      AND r.create_time >= CURRENT_DATE - INTERVAL '1 day'
  LOOP
    INSERT INTO review_alerts (review_id, alert_type, payload)
    VALUES (
      review_record.review_id, 
      review_record.alert_type,
      jsonb_build_object(
        'rating', review_record.rating,
        'comment', review_record.comment,
        'location_id', review_record.location_id
      )
    );
  END LOOP;

  -- Alertas para avaliações com sentimento negativo
  FOR review_record IN
    SELECT 
      r.review_id,
      r.location_id,
      r.rating,
      r.comment,
      'negative_sentiment' as alert_type
    FROM reviews r
    JOIN review_labels rl ON r.review_id = rl.review_id
    LEFT JOIN review_alerts ra ON r.review_id = ra.review_id AND ra.alert_type = 'negative_sentiment'
    WHERE rl.sentiment = 'neg'
      AND ra.id IS NULL
      AND r.create_time >= CURRENT_DATE - INTERVAL '1 day'
  LOOP
    INSERT INTO review_alerts (review_id, alert_type, payload)
    VALUES (
      review_record.review_id, 
      review_record.alert_type,
      jsonb_build_object(
        'rating', review_record.rating,
        'comment', review_record.comment,
        'location_id', review_record.location_id,
        'sentiment', 'negative'
      )
    );
  END LOOP;

  -- Alertas para avaliações mencionando e-Notariado com baixa pontuação
  FOR review_record IN
    SELECT 
      r.review_id,
      r.location_id,
      r.rating,
      r.comment,
      'enotariado_issue' as alert_type
    FROM reviews r
    JOIN review_labels rl ON r.review_id = rl.review_id
    LEFT JOIN review_alerts ra ON r.review_id = ra.review_id AND ra.alert_type = 'enotariado_issue'
    WHERE rl.is_enotariado = true
      AND r.rating <= 3
      AND ra.id IS NULL
      AND r.create_time >= CURRENT_DATE - INTERVAL '1 day'
  LOOP
    INSERT INTO review_alerts (review_id, alert_type, payload)
    VALUES (
      review_record.review_id, 
      review_record.alert_type,
      jsonb_build_object(
        'rating', review_record.rating,
        'comment', review_record.comment,
        'location_id', review_record.location_id,
        'is_enotariado', true
      )
    );
  END LOOP;
END $function$;

-- Function: public.enqueue_collaborator_refresh_job(p_collaborator_id bigint, p_delay interval)
CREATE OR REPLACE FUNCTION public.enqueue_collaborator_refresh_job(p_collaborator_id bigint, p_delay interval DEFAULT '00:00:30'::interval)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_collaborator_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO review_collaborator_jobs(job_type, collaborator_id, job_status, scheduled_at, updated_at)
  VALUES ('collaborator', p_collaborator_id, 'pending', now() + p_delay, now())
  ON CONFLICT (job_type, collaborator_id) WHERE collaborator_id IS NOT NULL DO UPDATE
    SET scheduled_at = LEAST(review_collaborator_jobs.scheduled_at, excluded.scheduled_at),
        job_status = 'pending',
        attempt_count = 0,
        updated_at = now();
END;
$function$;

-- Function: public.enqueue_nlp_review(p_review_id text)
CREATE OR REPLACE FUNCTION public.enqueue_nlp_review(p_review_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO nlp_queue (review_id, status)
  VALUES (p_review_id, 'pending')
  ON CONFLICT (review_id) DO UPDATE SET 
    status = 'pending', 
    available_at = now(), 
    last_error = null;
END $function$;

-- Function: public.enqueue_review_collaborator_job(p_review_id text, p_comment text, p_delay interval)
CREATE OR REPLACE FUNCTION public.enqueue_review_collaborator_job(p_review_id text, p_comment text, p_delay interval DEFAULT '00:00:00'::interval)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  if p_review_id is null or trim(p_review_id) = '' then
    return;
  end if;

  insert into review_collaborator_jobs(
    job_type,
    review_id,
    comment,
    scheduled_at,
    job_status,
    updated_at
  )
  values (
    'review',
    p_review_id,
    p_comment,
    now() + p_delay,
    'pending',
    now()
  )
  on conflict (job_type, review_id) do update
    set comment = coalesce(excluded.comment, review_collaborator_jobs.comment),
        scheduled_at = least(review_collaborator_jobs.scheduled_at, excluded.scheduled_at),
        job_status = 'pending',
        updated_at = now();
end;
$function$;

-- Function: public.escape_like_special(text)
CREATE OR REPLACE FUNCTION public.escape_like_special(text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select replace(replace(replace($1, '\\', '\\\\'), '%', '\\%'), '_', '\\_');
$function$;

-- Function: public.escape_regex_special(text)
CREATE OR REPLACE FUNCTION public.escape_regex_special(text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select regexp_replace($1, '([\\\.\+\*\?\|\(\)\[\]\{\}\^\$\-])', '\\\\\1', 'g');
$function$;

-- Function: public.fail_nlp_review(p_review_id text, p_error text)
CREATE OR REPLACE FUNCTION public.fail_nlp_review(p_review_id text, p_error text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE nlp_queue
  SET status = 'failed', 
      attempts = attempts + 1, 
      available_at = now() + interval '5 minutes', 
      last_error = p_error
  WHERE review_id = p_review_id;
END $function$;

-- Function: public.find_collaborator_mentions(review_text text)
CREATE OR REPLACE FUNCTION public.find_collaborator_mentions(review_text text)
 RETURNS TABLE(collaborator_id bigint, full_name text, matched_alias text, match_score real, snippet text, context_found text)
 LANGUAGE plpgsql
AS $function$
declare
  collab record;
  raw_review text := coalesce(review_text, '');
  normalized_review text := unaccent(lower(raw_review));
  normalized_length int := char_length(normalized_review);
  review_length int := char_length(raw_review);
  context_keywords text[] := array['e-notariado','enotariado','assinatura digital','assinatura eletronica','certificado digital','videoconferencia','token','cartorio paulista','cartorio','notariado','assinatura online','solucao digital'];
  positive_keywords text[] := array['atendimento','ajud','orient','resolveu','profission','rapid','nota','excelente','otim','educad','gentil','prestativ','bom','maravilh','super','incrivel','top','aten','atencios','competent','qualific','explic','parabens','elog','indico','agrade'];
  context_word text;
  has_context boolean := false;
  has_positive boolean := false;
  candidate_aliases text[];
  alias_text text;
  normalized_alias text;
  alias_len int;
  offset_pos int;
  search_text text;
  match_pos int;
  actual_pos int;
  prev_char text;
  next_char text;
  snippet_start int;
  snippet_end int;
  snippet_text text;
  best_score real := 0::real;
  best_alias text;
  best_snippet text;
  best_context text;
  normalized_full text;
  name_tokens text[];
  first_name text;
  last_name text;
  last_initial text;
  alias_category text;
  current_context_label text;
  current_score real;
  trimmed_alias text;
begin
  if normalized_review = '' then
    return;
  end if;

  foreach context_word in array context_keywords loop
    if position(unaccent(lower(context_word)) in normalized_review) > 0 then
      has_context := true;
      exit;
    end if;
  end loop;

  foreach context_word in array positive_keywords loop
    if position(context_word in normalized_review) > 0 then
      has_positive := true;
      exit;
    end if;
  end loop;

  for collab in
    select c.id, c.full_name, coalesce(c.aliases, array[]::text[]) as aliases
    from collaborators c
    where c.is_active = true
  loop
    normalized_full := unaccent(lower(collab.full_name));
    name_tokens := regexp_split_to_array(normalized_full, '\s+');

    first_name := null;
    last_name := null;
    last_initial := null;

    if array_length(name_tokens,1) >= 1 then
      first_name := name_tokens[1];
    end if;
    if array_length(name_tokens,1) >= 2 then
      last_name := name_tokens[array_length(name_tokens,1)];
      last_initial := left(last_name, 1);
    end if;

    candidate_aliases := collab.aliases;
    candidate_aliases := array_append(candidate_aliases, collab.full_name);

    if first_name is not null then
      candidate_aliases := array_append(candidate_aliases, initcap(first_name));
    end if;

    if first_name is not null and last_name is not null then
      candidate_aliases := array_append(candidate_aliases, initcap(first_name) || ' ' || initcap(last_name));
      candidate_aliases := array_append(candidate_aliases, initcap(first_name) || ' ' || upper(last_initial));
      candidate_aliases := array_append(candidate_aliases, initcap(first_name) || ' ' || upper(last_initial) || '.');
    end if;

    candidate_aliases := (
      select array_agg(distinct alias)
      from (
        select trim(alias) as alias
        from unnest(candidate_aliases) alias
        where alias is not null and length(trim(alias)) >= 3
      ) t
    );

    best_score := 0::real;
    best_alias := null;
    best_snippet := null;
    best_context := null;

    if candidate_aliases is null then
      continue;
    end if;

    foreach alias_text in array candidate_aliases loop
      trimmed_alias := trim(alias_text);
      if trimmed_alias = '' then
        continue;
      end if;
      normalized_alias := unaccent(lower(trimmed_alias));
      alias_len := char_length(normalized_alias);

      if alias_len < 3 then
        continue;
      end if;

      offset_pos := 0;
      loop
        exit when offset_pos >= normalized_length;

        search_text := substring(normalized_review from offset_pos + 1);
        match_pos := position(normalized_alias in search_text);
        exit when match_pos = 0;

        actual_pos := offset_pos + match_pos;

        prev_char := case when actual_pos = 1 then ' ' else substring(normalized_review from actual_pos - 1 for 1) end;
        next_char := case when actual_pos + alias_len > normalized_length then ' ' else substring(normalized_review from actual_pos + alias_len for 1) end;

        if prev_char ~ '[[:alpha:]]' or next_char ~ '[[:alpha:]]' then
          null;
        else
          snippet_start := greatest(1, actual_pos - 60);
          snippet_end := least(review_length, actual_pos + alias_len + 60);
          if snippet_end < snippet_start then
            snippet_end := snippet_start;
          end if;
          snippet_text := substring(raw_review from snippet_start for snippet_end - snippet_start + 1);

          if normalized_alias = normalized_full then
            alias_category := 'nome_completo';
            current_score := 0.97::real;
          elsif first_name is not null and last_name is not null and normalized_alias = first_name || ' ' || last_name then
            alias_category := 'nome_sobrenome';
            current_score := 0.94::real;
          elsif first_name is not null and normalized_alias = first_name then
            alias_category := 'primeiro_nome';
            current_score := 0.82::real;
          else
            alias_category := 'alias';
            current_score := 0.90::real;
          end if;

          if alias_category = 'primeiro_nome' and not has_context and not has_positive then
            current_score := current_score - 0.15::real;
          end if;

          if alias_len <= 4 and alias_category <> 'nome_completo' then
            current_score := current_score - 0.05::real;
          end if;

          if has_context then
            current_score := least(1.0::real, current_score + 0.05::real);
            current_context_label := alias_category || '_contexto';
          else
            current_context_label := alias_category;
          end if;

          if current_score >= 0.65::real and current_score > best_score then
            best_score := current_score;
            best_alias := trimmed_alias;
            best_snippet := snippet_text;
            best_context := current_context_label;
          end if;

          exit;
        end if;

        offset_pos := actual_pos + alias_len;
      end loop;
    end loop;

    if best_score > 0::real then
      return query
        select collab.id, collab.full_name, best_alias, best_score, best_snippet, best_context;
    end if;
  end loop;
end;
$function$;

-- Function: public.get_collaborator_mentions()
CREATE OR REPLACE FUNCTION public.get_collaborator_mentions()
 RETURNS TABLE(full_name text, department text, mentions bigint, avg_rating_when_mentioned numeric, latest_mention timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    c.full_name,
    coalesce(c.department, 'Não informado') as department,
    count(rc.review_id) as mentions,
    avg(r.rating)::numeric(4,2) as avg_rating_when_mentioned,
    max(r.create_time) as latest_mention
  from collaborators c
  left join review_collaborators rc on c.id = rc.collaborator_id
  left join reviews r on rc.review_id = r.review_id
  where c.is_active = true
  group by c.id, c.full_name, c.department
  order by mentions desc, c.full_name;
$function$;

-- Function: public.get_collaborator_mentions_by_month(p_month text)
CREATE OR REPLACE FUNCTION public.get_collaborator_mentions_by_month(p_month text)
 RETURNS TABLE(full_name text, department text, mentions bigint, avg_rating_when_mentioned numeric, latest_mention timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    c.full_name,
    coalesce(c.department, 'Não informado') as department,
    count(rc.review_id) as mentions,
    avg(r.rating)::numeric(4,2) as avg_rating_when_mentioned,
    max(r.create_time) as latest_mention
  from collaborators c
  left join review_collaborators rc on c.id = rc.collaborator_id
  left join reviews r on rc.review_id = r.review_id
  where c.is_active = true
    and r.create_time is not null
    and to_char(date_trunc('month', r.create_time), 'YYYY-MM') = p_month
  group by c.id, c.full_name, c.department
  order by mentions desc, c.full_name;
$function$;

-- Function: public.get_collaborators_stats()
CREATE OR REPLACE FUNCTION public.get_collaborators_stats()
 RETURNS TABLE(total_collaborators bigint, active_collaborators bigint, inactive_collaborators bigint, top_department text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    count(*) as total_collaborators,
    count(case when is_active then 1 end) as active_collaborators,
    count(case when not is_active then 1 end) as inactive_collaborators,
    (SELECT department
     FROM collaborators
     WHERE department IS NOT NULL
     GROUP BY department
     ORDER BY count(*) DESC
     LIMIT 1) as top_department
  FROM collaborators;
$function$;

-- Function: public.get_daily_trends(p_days integer)
CREATE OR REPLACE FUNCTION public.get_daily_trends(p_days integer DEFAULT 90)
 RETURNS TABLE(day date, total bigint, avg_rating numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    (coalesce(r.create_time, rr.received_at))::date as day,
    count(*) as total,
    avg(r.rating)::numeric(4,2) as avg_rating
  from reviews r
  left join reviews_raw rr using (review_id)
  where coalesce(r.create_time, rr.received_at) >= now() - (p_days || ' days')::interval
  group by 1
  order by 1 desc
$function$;

-- Function: public.get_daily_trends(p_days integer, p_location_id text)
CREATE OR REPLACE FUNCTION public.get_daily_trends(p_days integer DEFAULT 30, p_location_id text DEFAULT 'cartorio-paulista-location'::text)
 RETURNS TABLE(day date, total_reviews bigint, avg_rating numeric, five_star_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select
      date_trunc('day', create_time)::date as day,
      rating
    from reviews
    where create_time >= (current_date - (p_days || ' days')::interval)
      and location_id = p_location_id
      and source = 'apify'
  )
  select
    day,
    count(*) as total_reviews,
    avg(rating)::numeric(4,2) as avg_rating,
    count(case when rating = 5 then 1 end) as five_star_count
  from base
  group by day
  order by day asc;
$function$;

-- Function: public.get_daily_trends_for_month(p_month text)
CREATE OR REPLACE FUNCTION public.get_daily_trends_for_month(p_month text)
 RETURNS TABLE(day date, total_reviews bigint, avg_rating numeric, five_star_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    date_trunc('day', r.create_time)::date as day,
    count(*) as total_reviews,
    avg(r.rating)::numeric(4,2) as avg_rating,
    count(case when r.rating = 5 then 1 end) as five_star_count
  from reviews r
  where to_char(date_trunc('month', r.create_time), 'YYYY-MM') = p_month
  group by 1
  order by 1 asc;
$function$;

-- Function: public.get_monthly_stats(p_month text, p_location_id text)
CREATE OR REPLACE FUNCTION public.get_monthly_stats(p_month text, p_location_id text DEFAULT 'cartorio-paulista-location'::text)
 RETURNS TABLE(total_reviews bigint, avg_rating numeric, five_star_percentage numeric, oldest_review timestamp with time zone, newest_review timestamp with time zone, five_star_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    count(*) as total_reviews,
    avg(rating)::numeric(4,2) as avg_rating,
    case when count(*) > 0 then
      (count(case when rating = 5 then 1 end) * 100.0 / count(*))::numeric(5,2)
    else 0 end as five_star_percentage,
    min(create_time) as oldest_review,
    max(create_time) as newest_review,
    count(case when rating = 5 then 1 end) as five_star_count
  from reviews
  where to_char(date_trunc('month', create_time), 'YYYY-MM') = p_month
    and location_id = p_location_id
    and source = 'apify';
$function$;

-- Function: public.get_monthly_stats(p_month text)
CREATE OR REPLACE FUNCTION public.get_monthly_stats(p_month text)
 RETURNS TABLE(total_reviews bigint, avg_rating numeric, five_star_percentage numeric, oldest_review timestamp with time zone, newest_review timestamp with time zone, five_star_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from get_monthly_stats(p_month, 'cartorio-paulista-location');
$function$;

-- Function: public.get_monthly_trends(p_location_id text)
CREATE OR REPLACE FUNCTION public.get_monthly_trends(p_location_id text DEFAULT 'cartorio-paulista-location'::text)
 RETURNS TABLE(month text, total_reviews bigint, avg_rating numeric, five_star_count bigint, four_star_count bigint, three_star_count bigint, two_star_count bigint, one_star_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    to_char(date_trunc('month', create_time), 'YYYY-MM') as month,
    count(*) as total_reviews,
    avg(rating)::numeric(4,2) as avg_rating,
    count(case when rating = 5 then 1 end) as five_star_count,
    count(case when rating = 4 then 1 end) as four_star_count,
    count(case when rating = 3 then 1 end) as three_star_count,
    count(case when rating = 2 then 1 end) as two_star_count,
    count(case when rating = 1 then 1 end) as one_star_count
  from reviews
  where location_id = p_location_id
    and source = 'apify'
    and create_time >= date_trunc('month', current_date - interval '11 months')
  group by date_trunc('month', create_time)
  order by month desc;
$function$;

-- Function: public.get_monthly_trends()
CREATE OR REPLACE FUNCTION public.get_monthly_trends()
 RETURNS TABLE(month text, total_reviews bigint, avg_rating numeric, five_star_count bigint, four_star_count bigint, three_star_count bigint, two_star_count bigint, one_star_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from get_monthly_trends('cartorio-paulista-location');
$function$;

-- Function: public.get_monthly_trends_ext(p_location_id text, p_months integer)
CREATE OR REPLACE FUNCTION public.get_monthly_trends_ext(p_location_id text, p_months integer)
 RETURNS TABLE(month date, total_reviews bigint, avg_rating numeric, reviews_enotariado bigint, avg_rating_enotariado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select 
    mv.month,
    mv.total_reviews,
    mv.avg_rating,
    mv.reviews_enotariado,
    mv.avg_rating_enotariado
  from mv_monthly mv
  where (p_location_id is null or mv.location_id = p_location_id)
    and mv.month >= current_date - interval '1 month' * p_months
  order by mv.month desc;
end $function$;

-- Function: public.get_pending_alerts(p_alert_type text, p_limit integer)
CREATE OR REPLACE FUNCTION public.get_pending_alerts(p_alert_type text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint, review_id text, alert_type text, sent_at timestamp with time zone, payload jsonb, review_rating integer, review_comment text, location_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    ra.id,
    ra.review_id,
    ra.alert_type,
    ra.sent_at,
    ra.payload,
    r.rating,
    r.comment,
    gl.name as location_name
  FROM review_alerts ra
  JOIN reviews r ON ra.review_id = r.review_id
  LEFT JOIN gbp_locations gl ON r.location_id = gl.location_id
  WHERE (p_alert_type IS NULL OR ra.alert_type = p_alert_type)
  ORDER BY ra.sent_at DESC
  LIMIT p_limit;
END $function$;

-- Function: public.get_recent_reviews(limit_param integer, p_location_id text)
CREATE OR REPLACE FUNCTION public.get_recent_reviews(limit_param integer DEFAULT 10, p_location_id text DEFAULT 'cartorio-paulista-location'::text)
 RETURNS TABLE(review_id text, location_id text, rating integer, comment text, reviewer_name text, create_time timestamp with time zone, update_time timestamp with time zone, collection_source text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    r.review_id,
    r.location_id,
    r.rating,
    r.comment,
    r.reviewer_name,
    r.create_time,
    r.update_time,
    'apify' as collection_source
  from reviews r
  where r.location_id = p_location_id
    and r.source = 'apify'
  order by r.create_time desc
  limit limit_param;
$function$;

-- Function: public.get_recent_reviews_with_fallback(limit_param integer)
CREATE OR REPLACE FUNCTION public.get_recent_reviews_with_fallback(limit_param integer DEFAULT 10)
 RETURNS TABLE(review_id text, location_id text, rating integer, comment text, reviewer_name text, display_time timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    r.review_id,
    r.location_id,
    r.rating,
    r.comment,
    r.reviewer_name,
    coalesce(r.create_time, rr.received_at) as display_time
  from reviews r
  left join reviews_raw rr using (review_id)
  order by coalesce(r.create_time, rr.received_at) desc
  limit limit_param
$function$;

-- Function: public.get_reviews_by_month(p_month text, p_limit integer, p_offset integer, p_location_id text)
CREATE OR REPLACE FUNCTION public.get_reviews_by_month(p_month text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0, p_location_id text DEFAULT NULL::text)
 RETURNS TABLE(review_id text, location_id text, rating integer, comment text, reviewer_name text, create_time timestamp with time zone, update_time timestamp with time zone, collection_source text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.review_id, r.location_id, r.rating, r.comment, r.reviewer_name, r.create_time, r.update_time, 'google'::text as collection_source
  from reviews r
  where to_char(date_trunc('month', r.create_time), 'YYYY-MM') = p_month
    and (p_location_id is null or r.location_id = p_location_id)
  order by r.create_time desc
  limit p_limit offset p_offset;
$function$;

-- Function: public.get_reviews_by_month(p_month text, p_location_id text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.get_reviews_by_month(p_month text, p_location_id text DEFAULT 'cartorio-paulista-location'::text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(review_id text, location_id text, rating integer, comment text, reviewer_name text, create_time timestamp with time zone, update_time timestamp with time zone, collection_source text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    r.review_id,
    r.location_id,
    r.rating,
    r.comment,
    r.reviewer_name,
    r.create_time,
    r.update_time,
    'apify'::text as collection_source
  from reviews r
  where to_char(date_trunc('month', r.create_time), 'YYYY-MM') = p_month
    and r.location_id = p_location_id
    and r.source = 'apify'
  order by r.create_time desc
  limit p_limit
  offset p_offset;
$function$;

-- Function: public.get_reviews_by_month(p_month text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.get_reviews_by_month(p_month text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(review_id text, location_id text, rating integer, comment text, reviewer_name text, create_time timestamp with time zone, update_time timestamp with time zone, collection_source text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from get_reviews_by_month(p_month, 'cartorio-paulista-location', p_limit, p_offset);
$function$;

-- Function: public.get_reviews_stats(p_location_id text)
CREATE OR REPLACE FUNCTION public.get_reviews_stats(p_location_id text DEFAULT 'cartorio-paulista-location'::text)
 RETURNS TABLE(total_reviews bigint, avg_rating numeric, oldest_review timestamp with time zone, newest_review timestamp with time zone, five_star_count bigint, five_star_percentage numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    count(*) as total_reviews,
    avg(rating)::numeric(4,2) as avg_rating,
    min(create_time) as oldest_review,
    max(create_time) as newest_review,
    count(case when rating = 5 then 1 end) as five_star_count,
    case when count(*) > 0 then
      (count(case when rating = 5 then 1 end) * 100.0 / count(*))::numeric(5,2)
    else 0 end as five_star_percentage
  from reviews
  where location_id = p_location_id
    and source = 'apify';
$function$;

-- Function: public.get_reviews_stats()
CREATE OR REPLACE FUNCTION public.get_reviews_stats()
 RETURNS TABLE(total_reviews bigint, avg_rating numeric, oldest_review timestamp with time zone, newest_review timestamp with time zone, five_star_count bigint, five_star_percentage numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from get_reviews_stats('cartorio-paulista-location');
$function$;

-- Function: public.match_review_collaborators(p_review_id text, p_review_comment text, p_target_collaborator bigint, p_context_window integer)
CREATE OR REPLACE FUNCTION public.match_review_collaborators(p_review_id text, p_review_comment text, p_target_collaborator bigint DEFAULT NULL::bigint, p_context_window integer DEFAULT 40)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  norm_comment text := normalize_unaccent_lower(p_review_comment);
  collaborator_row record;
  alias_row record;
  alias_norm text;
  alias_pattern text;
  snippet text;
  alias_score real;
begin
  if norm_comment = '' then
    return;
  end if;

  for collaborator_row in
    select id
    from collaborators
    where is_active
      and (p_target_collaborator is null or id = p_target_collaborator)
  loop
    for alias_row in select alias, is_full_name from collaborator_alias_entries(collaborator_row.id)
    loop
      alias_norm := normalize_unaccent_lower(alias_row.alias);
      if alias_norm = '' then
        continue;
      end if;

      alias_pattern := escape_regex_special(alias_norm);
      if alias_pattern = '' then
        continue;
      end if;

      alias_score := case when alias_row.is_full_name then 0.97 else 0.90 end;

      if norm_comment ~ format('(^|\\W)%s(\\W|$)', alias_pattern) then
        snippet := substring(
          p_review_comment
          from format(
            '(?i)(.{0,%s})%s(.{0,%s})',
            p_context_window,
            escape_regex_special(alias_row.alias),
            p_context_window
          )
        );
        if snippet is null or snippet = '' then
          snippet := alias_row.alias;
        end if;

        insert into review_collaborators(review_id, collaborator_id, mention_snippet, match_score)
        values (
          p_review_id,
          collaborator_row.id,
          snippet,
          alias_score
        )
        on conflict (review_id, collaborator_id) do update
          set mention_snippet = excluded.mention_snippet,
              match_score = greatest(review_collaborators.match_score, excluded.match_score);
      end if;
    end loop;
  end loop;
end;
$function$;

-- Function: public.normalize_unaccent_lower(text)
CREATE OR REPLACE FUNCTION public.normalize_unaccent_lower(text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select lower(unaccent(coalesce($1, '')));
$function$;

-- Function: public.persist_reviews_atomic(p_new_reviews jsonb[], p_updated_reviews jsonb[], p_location_id text, p_run_id bigint)
CREATE OR REPLACE FUNCTION public.persist_reviews_atomic(p_new_reviews jsonb[], p_updated_reviews jsonb[], p_location_id text, p_run_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  inserted_count integer := 0;
  updated_count integer := 0;
  raw_upserted integer := 0;
BEGIN
  -- Upsert raw payloads for new reviews
  IF array_length(p_new_reviews, 1) IS NOT NULL THEN
    INSERT INTO public.reviews_raw (review_id, location_id, raw_payload, received_at, last_seen_at)
    SELECT 
      (review->>'review_id')::text,
      p_location_id,
      review->'raw_payload',
      now(),
      now()
    FROM unnest(p_new_reviews) AS review
    ON CONFLICT (review_id) DO UPDATE SET
      raw_payload = EXCLUDED.raw_payload,
      last_seen_at = now();
    raw_upserted := raw_upserted + array_length(p_new_reviews, 1);
  END IF;

  -- Upsert raw payloads for updated reviews
  IF array_length(p_updated_reviews, 1) IS NOT NULL THEN
    INSERT INTO public.reviews_raw (review_id, location_id, raw_payload, received_at, last_seen_at)
    SELECT 
      (review->>'review_id')::text,
      p_location_id,
      review->'raw_payload',
      now(),
      now()
    FROM unnest(p_updated_reviews) AS review
    ON CONFLICT (review_id) DO UPDATE SET
      raw_payload = EXCLUDED.raw_payload,
      last_seen_at = now();
    raw_upserted := raw_upserted + array_length(p_updated_reviews, 1);
  END IF;

  -- Insert new reviews and count inserted
  IF array_length(p_new_reviews, 1) IS NOT NULL THEN
    INSERT INTO public.reviews AS r (
      review_id,
      location_id,
      rating,
      comment,
      reviewer_name,
      reviewer_id,
      reviewer_url,
      review_url,
      is_local_guide,
      reviewer_photo_url,
      original_language,
      translated_text,
      create_time,
      update_time,
      response_text,
      response_time,
      last_seen_at,
      source
    )
    SELECT 
      (review->>'review_id')::text,
      p_location_id,
      (review->>'rating')::int,
      review->>'comment',
      review->>'reviewer_name',
      review->>'reviewer_id',
      review->>'reviewer_url',
      review->>'review_url',
      CASE WHEN review ? 'is_local_guide' THEN (review->>'is_local_guide')::boolean ELSE NULL END,
      review->>'reviewer_photo_url',
      review->>'original_language',
      review->>'translated_text',
      NULLIF(review->>'create_time', '')::timestamptz,
      NULLIF(review->>'update_time', '')::timestamptz,
      review->>'response_text',
      NULLIF(review->>'response_time', '')::timestamptz,
      now(),
      COALESCE(review->>'source', 'apify')
    FROM unnest(p_new_reviews) AS review
    ON CONFLICT (review_id) DO UPDATE SET
      rating = EXCLUDED.rating,
      comment = EXCLUDED.comment,
      reviewer_name = EXCLUDED.reviewer_name,
      reviewer_id = EXCLUDED.reviewer_id,
      reviewer_url = EXCLUDED.reviewer_url,
      review_url = EXCLUDED.review_url,
      is_local_guide = EXCLUDED.is_local_guide,
      reviewer_photo_url = EXCLUDED.reviewer_photo_url,
      original_language = EXCLUDED.original_language,
      translated_text = EXCLUDED.translated_text,
      update_time = EXCLUDED.update_time,
      response_text = EXCLUDED.response_text,
      response_time = EXCLUDED.response_time,
      last_seen_at = now(),
      source = EXCLUDED.source;

    inserted_count := array_length(p_new_reviews, 1);
  END IF;

  -- Update existing reviews
  IF array_length(p_updated_reviews, 1) IS NOT NULL THEN
    UPDATE public.reviews AS r
    SET 
      rating = (review->>'rating')::int,
      comment = review->>'comment',
      reviewer_name = review->>'reviewer_name',
      reviewer_id = review->>'reviewer_id',
      reviewer_url = review->>'reviewer_url',
      review_url = review->>'review_url',
      is_local_guide = CASE WHEN review ? 'is_local_guide' THEN (review->>'is_local_guide')::boolean ELSE NULL END,
      reviewer_photo_url = review->>'reviewer_photo_url',
      original_language = review->>'original_language',
      translated_text = review->>'translated_text',
      update_time = NULLIF(review->>'update_time', '')::timestamptz,
      response_text = review->>'response_text',
      response_time = NULLIF(review->>'response_time', '')::timestamptz,
      last_seen_at = now(),
      source = COALESCE(review->>'source', 'apify')
    FROM unnest(p_updated_reviews) AS review
    WHERE r.review_id = (review->>'review_id')::text;

    updated_count := array_length(p_updated_reviews, 1);
  END IF;

  UPDATE public.collection_runs 
  SET 
    reviews_new = COALESCE(reviews_new, 0) + inserted_count,
    reviews_updated = COALESCE(reviews_updated, 0) + updated_count,
    reviews_found = COALESCE(reviews_found, 0) + (inserted_count + updated_count)
  WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'raw_upserted', raw_upserted
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;

-- Function: public.process_collaborator_mentions()
CREATE OR REPLACE FUNCTION public.process_collaborator_mentions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    mention RECORD;
BEGIN
    -- Limpar menções anteriores se for um update
    IF TG_OP = 'UPDATE' THEN
        DELETE FROM review_collaborators WHERE review_id = NEW.review_id;
    END IF;

    -- Processar menções se há comentário
    IF NEW.comment IS NOT NULL AND length(trim(NEW.comment)) > 0 THEN
        FOR mention IN
            SELECT * FROM find_collaborator_mentions(NEW.comment)
        LOOP
            INSERT INTO review_collaborators (
                review_id,
                collaborator_id,
                mention_snippet,
                match_score,
                context_found
            ) VALUES (
                NEW.review_id,
                mention.collaborator_id,
                mention.snippet,
                mention.match_score,
                mention.context_found
            ) ON CONFLICT (review_id, collaborator_id) DO UPDATE SET
                mention_snippet = EXCLUDED.mention_snippet,
                match_score = EXCLUDED.match_score,
                context_found = EXCLUDED.context_found;
        END LOOP;
    END IF;

    RETURN NEW;
END $function$;

-- Function: public.process_review_collaborator_jobs(p_limit integer)
CREATE OR REPLACE FUNCTION public.process_review_collaborator_jobs(p_limit integer DEFAULT 100)
 RETURNS TABLE(processed_jobs integer, errors text[])
 LANGUAGE plpgsql
AS $function$
declare
  jobs_cursor record;
  processed_count integer := 0;
  errors_accum text[] := array[]::text[];
begin
  for jobs_cursor in
    select rcj.*
    from (
      select id
      from review_collaborator_jobs
      where job_status in ('pending','failed')
        and scheduled_at <= now()
      order by scheduled_at, attempt_count
      limit p_limit
      for update skip locked
    ) sel
    join review_collaborator_jobs rcj using (id)
  loop
    update review_collaborator_jobs
    set job_status = 'processing',
        attempt_count = attempt_count + 1,
        updated_at = now()
    where id = jobs_cursor.id;

    begin
      if jobs_cursor.job_type = 'review' then
        perform match_review_collaborators(jobs_cursor.review_id, jobs_cursor.comment);
      else
        perform reprocess_reviews_for_collaborator(jobs_cursor.collaborator_id);
      end if;

      update review_collaborator_jobs
      set job_status = 'completed',
          processed_at = now(),
          updated_at = now()
      where id = jobs_cursor.id;

    exception when others then
      errors_accum := array_append(errors_accum, format('job %s: %s', jobs_cursor.id, sqlerrm));
      update review_collaborator_jobs
      set job_status = 'failed',
          last_error = sqlerrm,
          scheduled_at = now() + interval '5 minutes',
          updated_at = now()
      where id = jobs_cursor.id;
    end;

    processed_count := processed_count + 1;
  end loop;

  return query select processed_count as processed_jobs, errors_accum as errors;
end;
$function$;

-- Function: public.refresh_monthly_view()
CREATE OR REPLACE FUNCTION public.refresh_monthly_view()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly;
END $function$;

-- Function: public.reprocess_reviews_for_collaborator(p_collaborator_id bigint)
CREATE OR REPLACE FUNCTION public.reprocess_reviews_for_collaborator(p_collaborator_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  alias_record record;
  alias_norm text;
  review_row record;
begin
  for alias_record in select alias from collaborator_alias_entries(p_collaborator_id)
  loop
    alias_norm := normalize_unaccent_lower(alias_record.alias);
    if alias_norm = '' then
      continue;
    end if;

    for review_row in
      select review_id, comment
      from reviews
      where comment is not null
        and lower(unaccent(comment)) like format('%%%s%%', escape_like_special(alias_norm)) escape '\'
    loop
      perform match_review_collaborators(review_row.review_id, review_row.comment, p_collaborator_id);
    end loop;
  end loop;
end;
$function$;

-- Function: public.reviews_match_collaborators_trigger()
CREATE OR REPLACE FUNCTION public.reviews_match_collaborators_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.comment is null then
    return new;
  end if;

  if TG_OP = 'UPDATE' and new.comment is not distinct from old.comment then
    return new;
  end if;

  perform enqueue_review_collaborator_job(new.review_id, new.comment);
  return new;
end;
$function$;

-- Function: public.reviews_set_tsv()
CREATE OR REPLACE FUNCTION public.reviews_set_tsv()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.tsv := setweight(to_tsvector('portuguese', unaccent(coalesce(NEW.comment, ''))), 'A');
  RETURN NEW;
END $function$;

-- Function: public.search_reviews(p_search_term text, p_location_id text, p_limit integer)
CREATE OR REPLACE FUNCTION public.search_reviews(p_search_term text, p_location_id text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(review_id text, location_id text, rating integer, comment text, reviewer_name text, create_time timestamp with time zone, match_score numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    r.review_id,
    r.location_id,
    r.rating,
    r.comment,
    r.reviewer_name,
    r.create_time,
    ts_rank(r.tsv, plainto_tsquery('portuguese', p_search_term)) as match_score
  FROM reviews r
  WHERE (p_location_id IS NULL OR r.location_id = p_location_id)
    AND r.tsv @@ plainto_tsquery('portuguese', p_search_term)
  ORDER BY match_score DESC, r.create_time DESC
  LIMIT p_limit;
END $function$;

-- Function: public.set_updated_at()
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $function$;

-- Function: public.update_location_metrics(location_id_param text)
CREATE OR REPLACE FUNCTION public.update_location_metrics(location_id_param text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with stats as (
    select
      count(*) as total_reviews,
      avg(rating)::numeric(4,2) as avg_rating,
      max(coalesce(last_seen_at, update_time, create_time)) as last_sync
    from reviews
    where location_id = location_id_param
      and source = 'apify'
  )
  update gbp_locations
    set
      total_reviews_count = stats.total_reviews,
      current_rating = stats.avg_rating,
      last_review_sync = stats.last_sync,
      metrics_last_updated = now()
  from stats
  where gbp_locations.location_id = location_id_param;
$function$;

-- ---------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------

drop trigger if exists "trg_collaborator_aliases" on public."collaborators";
CREATE TRIGGER trg_collaborator_aliases AFTER INSERT OR UPDATE ON collaborators FOR EACH ROW EXECUTE FUNCTION collaborator_alias_trigger();
drop trigger if exists "nlp_queue_set_updated_at" on public."nlp_queue";
CREATE TRIGGER nlp_queue_set_updated_at BEFORE UPDATE ON nlp_queue FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "process_collaborator_mentions_trg" on public."reviews";
CREATE TRIGGER process_collaborator_mentions_trg AFTER INSERT OR UPDATE OF comment ON reviews FOR EACH ROW EXECUTE FUNCTION process_collaborator_mentions();
drop trigger if exists "reviews_set_tsv_trg" on public."reviews";
CREATE TRIGGER reviews_set_tsv_trg BEFORE INSERT OR UPDATE OF comment ON reviews FOR EACH ROW EXECUTE FUNCTION reviews_set_tsv();
drop trigger if exists "trg_reviews_match_collaborators" on public."reviews";
CREATE TRIGGER trg_reviews_match_collaborators AFTER INSERT OR UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION reviews_match_collaborators_trigger();

-- ---------------------------------------------------------------
-- Materialized views
-- ---------------------------------------------------------------

create materialized view if not exists public."mv_monthly" as
 SELECT date_trunc('month'::text, r.create_time) AS month,
    r.location_id,
    count(*) AS total_reviews,
    (avg(r.rating))::numeric(4,2) AS avg_rating,
    sum(
        CASE
            WHEN rl.is_enotariado THEN 1
            ELSE 0
        END) AS reviews_enotariado,
    (avg(
        CASE
            WHEN rl.is_enotariado THEN r.rating
            ELSE NULL::integer
        END))::numeric(4,2) AS avg_rating_enotariado
   FROM (reviews r
     LEFT JOIN review_labels rl USING (review_id))
  GROUP BY (date_trunc('month'::text, r.create_time)), r.location_id
with no data;

-- ---------------------------------------------------------------
-- Row Level Security -- enable flags + policies (captured AS-IS)
-- WARNING: permissive policies below preserved from prod; dropped
--   in 20260409120100_rls_lockdown.sql.
-- ---------------------------------------------------------------

alter table public."collection_runs" enable row level security;
alter table public."gbp_accounts" enable row level security;
alter table public."gbp_locations" enable row level security;
alter table public."monitoring_config" enable row level security;
alter table public."nlp_queue" enable row level security;
alter table public."review_alerts" enable row level security;
alter table public."review_labels" enable row level security;
alter table public."review_services" enable row level security;
alter table public."reviews_raw" enable row level security;
alter table public."services" enable row level security;

-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "collaborators_insert_policy" on public."collaborators"
      as permissive
      for insert
      to public
      with check ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "collaborators_read_policy" on public."collaborators"
      as permissive
      for select
      to public
      using (true);
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "collaborators_update_policy" on public."collaborators"
      as permissive
      for update
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "Allow authenticated read access to collection_runs" on public."collection_runs"
      as permissive
      for select
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "Allow service role full access to collection_runs" on public."collection_runs"
      as permissive
      for all
      to public
      using ((auth.role() = 'service_role'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "gbp_accounts_insert_policy" on public."gbp_accounts"
      as permissive
      for insert
      to public
      with check ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "gbp_accounts_read_policy" on public."gbp_accounts"
      as permissive
      for select
      to public
      using (true);
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "gbp_accounts_update_policy" on public."gbp_accounts"
      as permissive
      for update
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "gbp_locations_insert_policy" on public."gbp_locations"
      as permissive
      for insert
      to public
      with check ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "gbp_locations_read_policy" on public."gbp_locations"
      as permissive
      for select
      to public
      using (true);
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "gbp_locations_update_policy" on public."gbp_locations"
      as permissive
      for update
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "Allow authenticated read access to monitoring_config" on public."monitoring_config"
      as permissive
      for select
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "Allow service role full access to monitoring_config" on public."monitoring_config"
      as permissive
      for all
      to public
      using ((auth.role() = 'service_role'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "nlp_queue_insert_policy" on public."nlp_queue"
      as permissive
      for insert
      to public
      with check ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "nlp_queue_read_policy" on public."nlp_queue"
      as permissive
      for select
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "nlp_queue_update_policy" on public."nlp_queue"
      as permissive
      for update
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "review_alerts_insert_policy" on public."review_alerts"
      as permissive
      for insert
      to public
      with check ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "review_alerts_read_policy" on public."review_alerts"
      as permissive
      for select
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "review_alerts_update_policy" on public."review_alerts"
      as permissive
      for update
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "review_collaborators_insert_policy" on public."review_collaborators"
      as permissive
      for insert
      to public
      with check (true);
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "review_collaborators_read_policy" on public."review_collaborators"
      as permissive
      for select
      to public
      using (true);
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "review_collaborators_update_policy" on public."review_collaborators"
      as permissive
      for update
      to public
      using (true)
      with check (true);
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "review_labels_insert_policy" on public."review_labels"
      as permissive
      for insert
      to public
      with check ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "review_labels_read_policy" on public."review_labels"
      as permissive
      for select
      to public
      using (true);
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "review_labels_update_policy" on public."review_labels"
      as permissive
      for update
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "review_services_insert_policy" on public."review_services"
      as permissive
      for insert
      to public
      with check ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "review_services_read_policy" on public."review_services"
      as permissive
      for select
      to public
      using (true);
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "review_services_update_policy" on public."review_services"
      as permissive
      for update
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "reviews_insert_policy" on public."reviews"
      as permissive
      for insert
      to public
      with check (true);
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "reviews_read_policy" on public."reviews"
      as permissive
      for select
      to public
      using (true);
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "reviews_update_policy" on public."reviews"
      as permissive
      for update
      to public
      using (true)
      with check (true);
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "reviews_raw_insert_cartorio_anon" on public."reviews_raw"
      as permissive
      for insert
      to "anon"
      with check ((location_id = 'cartorio_paulista_main'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "reviews_raw_insert_policy" on public."reviews_raw"
      as permissive
      for insert
      to public
      with check ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "reviews_raw_read_policy" on public."reviews_raw"
      as permissive
      for select
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "reviews_raw_update_cartorio_anon" on public."reviews_raw"
      as permissive
      for update
      to "anon"
      using ((location_id = 'cartorio_paulista_main'::text))
      with check ((location_id = 'cartorio_paulista_main'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "reviews_raw_update_policy" on public."reviews_raw"
      as permissive
      for update
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "services_insert_policy" on public."services"
      as permissive
      for insert
      to public
      with check ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "services_read_policy" on public."services"
      as permissive
      for select
      to public
      using (true);
exception when duplicate_object then null;
end $$;
-- permissive policy preserved from prod; dropped by rls_lockdown migration
do $$ begin
  create policy "services_update_policy" on public."services"
      as permissive
      for update
      to public
      using ((auth.role() = 'authenticated'::text));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------
-- Grants (captured AS-IS; revoked by revoke_anon_grants migration)
-- ---------------------------------------------------------------

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."collaborators" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."collaborators" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."collaborators" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."collection_runs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."collection_runs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."collection_runs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."gbp_accounts" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."gbp_accounts" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."gbp_accounts" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."gbp_locations" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."gbp_locations" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."gbp_locations" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."monitoring_config" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."monitoring_config" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."monitoring_config" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."nlp_queue" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."nlp_queue" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."nlp_queue" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_alerts" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_alerts" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_alerts" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_collaborator_jobs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_collaborator_jobs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_collaborator_jobs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_collaborators" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_collaborators" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_collaborators" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_collaborators_backup_cp" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_collaborators_backup_cp" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_collaborators_backup_cp" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_labels" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_labels" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_labels" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_services" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_services" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."review_services" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews_backup_cp" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews_backup_cp" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews_backup_cp" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews_legacy_archive" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews_legacy_archive" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews_legacy_archive" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews_raw" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews_raw" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews_raw" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews_raw_legacy_archive" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews_raw_legacy_archive" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."reviews_raw_legacy_archive" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."services" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."services" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public."services" to "service_role";

-- Function grants (user-defined functions only; extension-owned
-- functions are excluded). Revoked en masse by the next migration.
grant execute on function public."check_column_exists"(p_table_name text, p_column_name text) to "anon";
grant execute on function public."check_column_exists"(p_table_name text, p_column_name text) to "authenticated";
grant execute on function public."check_column_exists"(p_table_name text, p_column_name text) to "service_role";
grant execute on function public."check_table_column"(p_table_name text, p_column_name text) to "anon";
grant execute on function public."check_table_column"(p_table_name text, p_column_name text) to "authenticated";
grant execute on function public."check_table_column"(p_table_name text, p_column_name text) to "service_role";
grant execute on function public."claim_nlp_review"(p_worker_id text) to "anon";
grant execute on function public."claim_nlp_review"(p_worker_id text) to "authenticated";
grant execute on function public."claim_nlp_review"(p_worker_id text) to "service_role";
grant execute on function public."cleanup_legacy_from_dataset"(p_location_id text, p_ids text[], p_urls text[]) to "anon";
grant execute on function public."cleanup_legacy_from_dataset"(p_location_id text, p_ids text[], p_urls text[]) to "authenticated";
grant execute on function public."cleanup_legacy_from_dataset"(p_location_id text, p_ids text[], p_urls text[]) to "service_role";
grant execute on function public."collaborator_alias_entries"(p_collaborator_id bigint) to "anon";
grant execute on function public."collaborator_alias_entries"(p_collaborator_id bigint) to "authenticated";
grant execute on function public."collaborator_alias_entries"(p_collaborator_id bigint) to "service_role";
grant execute on function public."collaborator_alias_trigger"() to "anon";
grant execute on function public."collaborator_alias_trigger"() to "authenticated";
grant execute on function public."collaborator_alias_trigger"() to "service_role";
grant execute on function public."complete_nlp_review"(p_review_id text) to "anon";
grant execute on function public."complete_nlp_review"(p_review_id text) to "authenticated";
grant execute on function public."complete_nlp_review"(p_review_id text) to "service_role";
grant execute on function public."create_auto_alerts"() to "anon";
grant execute on function public."create_auto_alerts"() to "authenticated";
grant execute on function public."create_auto_alerts"() to "service_role";
grant execute on function public."enqueue_collaborator_refresh_job"(p_collaborator_id bigint, p_delay interval) to "anon";
grant execute on function public."enqueue_collaborator_refresh_job"(p_collaborator_id bigint, p_delay interval) to "authenticated";
grant execute on function public."enqueue_collaborator_refresh_job"(p_collaborator_id bigint, p_delay interval) to "service_role";
grant execute on function public."enqueue_nlp_review"(p_review_id text) to "anon";
grant execute on function public."enqueue_nlp_review"(p_review_id text) to "authenticated";
grant execute on function public."enqueue_nlp_review"(p_review_id text) to "service_role";
grant execute on function public."enqueue_review_collaborator_job"(p_review_id text, p_comment text, p_delay interval) to "anon";
grant execute on function public."enqueue_review_collaborator_job"(p_review_id text, p_comment text, p_delay interval) to "authenticated";
grant execute on function public."enqueue_review_collaborator_job"(p_review_id text, p_comment text, p_delay interval) to "service_role";
grant execute on function public."escape_like_special"(text) to "anon";
grant execute on function public."escape_like_special"(text) to "authenticated";
grant execute on function public."escape_like_special"(text) to "service_role";
grant execute on function public."escape_regex_special"(text) to "anon";
grant execute on function public."escape_regex_special"(text) to "authenticated";
grant execute on function public."escape_regex_special"(text) to "service_role";
grant execute on function public."fail_nlp_review"(p_review_id text, p_error text) to "anon";
grant execute on function public."fail_nlp_review"(p_review_id text, p_error text) to "authenticated";
grant execute on function public."fail_nlp_review"(p_review_id text, p_error text) to "service_role";
grant execute on function public."find_collaborator_mentions"(review_text text) to "anon";
grant execute on function public."find_collaborator_mentions"(review_text text) to "authenticated";
grant execute on function public."find_collaborator_mentions"(review_text text) to "service_role";
grant execute on function public."get_collaborator_mentions"() to "anon";
grant execute on function public."get_collaborator_mentions"() to "authenticated";
grant execute on function public."get_collaborator_mentions"() to "service_role";
grant execute on function public."get_collaborator_mentions_by_month"(p_month text) to "anon";
grant execute on function public."get_collaborator_mentions_by_month"(p_month text) to "authenticated";
grant execute on function public."get_collaborator_mentions_by_month"(p_month text) to "service_role";
grant execute on function public."get_collaborators_stats"() to "anon";
grant execute on function public."get_collaborators_stats"() to "authenticated";
grant execute on function public."get_collaborators_stats"() to "service_role";
grant execute on function public."get_daily_trends"(p_days integer) to "anon";
grant execute on function public."get_daily_trends"(p_days integer) to "authenticated";
grant execute on function public."get_daily_trends"(p_days integer) to "service_role";
grant execute on function public."get_daily_trends"(p_days integer, p_location_id text) to "anon";
grant execute on function public."get_daily_trends"(p_days integer, p_location_id text) to "authenticated";
grant execute on function public."get_daily_trends"(p_days integer, p_location_id text) to "service_role";
grant execute on function public."get_daily_trends_for_month"(p_month text) to "anon";
grant execute on function public."get_daily_trends_for_month"(p_month text) to "authenticated";
grant execute on function public."get_daily_trends_for_month"(p_month text) to "service_role";
grant execute on function public."get_monthly_stats"(p_month text) to "anon";
grant execute on function public."get_monthly_stats"(p_month text) to "authenticated";
grant execute on function public."get_monthly_stats"(p_month text) to "service_role";
grant execute on function public."get_monthly_stats"(p_month text, p_location_id text) to "anon";
grant execute on function public."get_monthly_stats"(p_month text, p_location_id text) to "authenticated";
grant execute on function public."get_monthly_stats"(p_month text, p_location_id text) to "service_role";
grant execute on function public."get_monthly_trends"() to "anon";
grant execute on function public."get_monthly_trends"() to "authenticated";
grant execute on function public."get_monthly_trends"() to "service_role";
grant execute on function public."get_monthly_trends"(p_location_id text) to "anon";
grant execute on function public."get_monthly_trends"(p_location_id text) to "authenticated";
grant execute on function public."get_monthly_trends"(p_location_id text) to "service_role";
grant execute on function public."get_monthly_trends_ext"(p_location_id text, p_months integer) to "anon";
grant execute on function public."get_monthly_trends_ext"(p_location_id text, p_months integer) to "authenticated";
grant execute on function public."get_monthly_trends_ext"(p_location_id text, p_months integer) to "service_role";
grant execute on function public."get_pending_alerts"(p_alert_type text, p_limit integer) to "anon";
grant execute on function public."get_pending_alerts"(p_alert_type text, p_limit integer) to "authenticated";
grant execute on function public."get_pending_alerts"(p_alert_type text, p_limit integer) to "service_role";
grant execute on function public."get_recent_reviews"(limit_param integer, p_location_id text) to "anon";
grant execute on function public."get_recent_reviews"(limit_param integer, p_location_id text) to "authenticated";
grant execute on function public."get_recent_reviews"(limit_param integer, p_location_id text) to "service_role";
grant execute on function public."get_recent_reviews_with_fallback"(limit_param integer) to "anon";
grant execute on function public."get_recent_reviews_with_fallback"(limit_param integer) to "authenticated";
grant execute on function public."get_recent_reviews_with_fallback"(limit_param integer) to "service_role";
grant execute on function public."get_reviews_by_month"(p_month text, p_limit integer, p_offset integer) to "anon";
grant execute on function public."get_reviews_by_month"(p_month text, p_limit integer, p_offset integer) to "authenticated";
grant execute on function public."get_reviews_by_month"(p_month text, p_limit integer, p_offset integer) to "service_role";
grant execute on function public."get_reviews_by_month"(p_month text, p_limit integer, p_offset integer, p_location_id text) to "anon";
grant execute on function public."get_reviews_by_month"(p_month text, p_limit integer, p_offset integer, p_location_id text) to "authenticated";
grant execute on function public."get_reviews_by_month"(p_month text, p_limit integer, p_offset integer, p_location_id text) to "service_role";
grant execute on function public."get_reviews_by_month"(p_month text, p_location_id text, p_limit integer, p_offset integer) to "anon";
grant execute on function public."get_reviews_by_month"(p_month text, p_location_id text, p_limit integer, p_offset integer) to "authenticated";
grant execute on function public."get_reviews_by_month"(p_month text, p_location_id text, p_limit integer, p_offset integer) to "service_role";
grant execute on function public."get_reviews_stats"() to "anon";
grant execute on function public."get_reviews_stats"() to "authenticated";
grant execute on function public."get_reviews_stats"() to "service_role";
grant execute on function public."get_reviews_stats"(p_location_id text) to "anon";
grant execute on function public."get_reviews_stats"(p_location_id text) to "authenticated";
grant execute on function public."get_reviews_stats"(p_location_id text) to "service_role";
grant execute on function public."match_review_collaborators"(p_review_id text, p_review_comment text, p_target_collaborator bigint, p_context_window integer) to "anon";
grant execute on function public."match_review_collaborators"(p_review_id text, p_review_comment text, p_target_collaborator bigint, p_context_window integer) to "authenticated";
grant execute on function public."match_review_collaborators"(p_review_id text, p_review_comment text, p_target_collaborator bigint, p_context_window integer) to "service_role";
grant execute on function public."normalize_unaccent_lower"(text) to "anon";
grant execute on function public."normalize_unaccent_lower"(text) to "authenticated";
grant execute on function public."normalize_unaccent_lower"(text) to "service_role";
grant execute on function public."persist_reviews_atomic"(p_new_reviews jsonb[], p_updated_reviews jsonb[], p_location_id text, p_run_id bigint) to "anon";
grant execute on function public."persist_reviews_atomic"(p_new_reviews jsonb[], p_updated_reviews jsonb[], p_location_id text, p_run_id bigint) to "authenticated";
grant execute on function public."persist_reviews_atomic"(p_new_reviews jsonb[], p_updated_reviews jsonb[], p_location_id text, p_run_id bigint) to "service_role";
grant execute on function public."process_collaborator_mentions"() to "anon";
grant execute on function public."process_collaborator_mentions"() to "authenticated";
grant execute on function public."process_collaborator_mentions"() to "service_role";
grant execute on function public."process_review_collaborator_jobs"(p_limit integer) to "anon";
grant execute on function public."process_review_collaborator_jobs"(p_limit integer) to "authenticated";
grant execute on function public."process_review_collaborator_jobs"(p_limit integer) to "service_role";
grant execute on function public."refresh_monthly_view"() to "anon";
grant execute on function public."refresh_monthly_view"() to "authenticated";
grant execute on function public."refresh_monthly_view"() to "service_role";
grant execute on function public."reprocess_reviews_for_collaborator"(p_collaborator_id bigint) to "anon";
grant execute on function public."reprocess_reviews_for_collaborator"(p_collaborator_id bigint) to "authenticated";
grant execute on function public."reprocess_reviews_for_collaborator"(p_collaborator_id bigint) to "service_role";
grant execute on function public."reviews_match_collaborators_trigger"() to "anon";
grant execute on function public."reviews_match_collaborators_trigger"() to "authenticated";
grant execute on function public."reviews_match_collaborators_trigger"() to "service_role";
grant execute on function public."reviews_set_tsv"() to "anon";
grant execute on function public."reviews_set_tsv"() to "authenticated";
grant execute on function public."reviews_set_tsv"() to "service_role";
grant execute on function public."search_reviews"(p_search_term text, p_location_id text, p_limit integer) to "anon";
grant execute on function public."search_reviews"(p_search_term text, p_location_id text, p_limit integer) to "authenticated";
grant execute on function public."search_reviews"(p_search_term text, p_location_id text, p_limit integer) to "service_role";
grant execute on function public."set_updated_at"() to "anon";
grant execute on function public."set_updated_at"() to "authenticated";
grant execute on function public."set_updated_at"() to "service_role";
grant execute on function public."update_location_metrics"(location_id_param text) to "anon";
grant execute on function public."update_location_metrics"(location_id_param text) to "authenticated";
grant execute on function public."update_location_metrics"(location_id_param text) to "service_role";

