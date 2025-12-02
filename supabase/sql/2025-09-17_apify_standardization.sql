-- Padronização Apify: migração de esquema, índices e RPCs com p_location_id e filtro source='apify'
-- Executável de forma idempotente

-- 1) Alterações na tabela reviews: colunas novas conforme padrão Apify
alter table if exists reviews
  add column if not exists review_url text,
  add column if not exists reviewer_id text,
  add column if not exists reviewer_url text,
  add column if not exists is_local_guide boolean,
  add column if not exists reviewer_photo_url text,
  add column if not exists original_language text,
  add column if not exists translated_text text,
  add column if not exists response_text text,
  add column if not exists response_time timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists source text default 'apify';

-- Preencher source para linhas existentes sem valor
update reviews set source = 'apify' where source is null;

-- Garantir coluna last_seen_at em reviews_raw para histórico de coleta
alter table if exists reviews_raw
  add column if not exists last_seen_at timestamptz;

-- 2) Índices/constraints
-- Índice único condicional para review_url quando não nulo
do $$ begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'i' and c.relname = 'uq_reviews_review_url_not_null'
  ) then
    execute 'create unique index uq_reviews_review_url_not_null on reviews(review_url) where review_url is not null';
  end if;
end $$;

-- Garantir índice (location_id, create_time) já criado em init.sql; manter idempotência
create index if not exists idx_reviews_location_time on reviews(location_id, create_time);

create table if not exists reviews_legacy_archive (like reviews including all);
create table if not exists reviews_raw_legacy_archive (like reviews_raw including all);

-- 3.1) Registro de execuções de coleta (Apify)
create table if not exists collection_runs (
  id bigserial primary key,
  location_id text references gbp_locations(location_id) on delete cascade,
  run_type text not null check (run_type in ('manual','scheduled')),
  status text not null default 'running' check (status in ('running','completed','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  reviews_found integer,
  reviews_new integer,
  reviews_updated integer,
  execution_time_ms integer,
  apify_run_id text,
  error_message text,
  metadata jsonb default '{}'::jsonb
);

create index if not exists idx_collection_runs_location_started on collection_runs(location_id, started_at desc);
create index if not exists idx_collection_runs_status on collection_runs(status);

-- 4) RPCs com p_location_id e filtro estrito por source='apify'

-- get_reviews_stats
create or replace function get_reviews_stats(p_location_id text default 'cartorio-paulista-location')
returns table (
  total_reviews bigint,
  avg_rating numeric(4,2),
  oldest_review timestamptz,
  newest_review timestamptz,
  five_star_count bigint,
  five_star_percentage numeric(5,2)
) language sql
security definer
set search_path = public
as $$
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
$$;
grant execute on function get_reviews_stats(text) to anon, authenticated;

-- Wrapper sem parâmetros para compatibilidade
create or replace function get_reviews_stats()
returns table (
  total_reviews bigint,
  avg_rating numeric(4,2),
  oldest_review timestamptz,
  newest_review timestamptz,
  five_star_count bigint,
  five_star_percentage numeric(5,2)
) language sql
security definer
set search_path = public
as $$
  select * from get_reviews_stats('cartorio-paulista-location');
$$;

-- get_recent_reviews
create or replace function get_recent_reviews(
  limit_param integer default 10,
  p_location_id text default 'cartorio-paulista-location'
)
returns table (
  review_id text,
  location_id text,
  rating integer,
  comment text,
  reviewer_name text,
  create_time timestamptz,
  update_time timestamptz,
  collection_source text
) language sql
security definer
set search_path = public
as $$
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
$$;
grant execute on function get_recent_reviews(integer, text) to anon, authenticated;

-- get_monthly_trends
create or replace function get_monthly_trends(p_location_id text default 'cartorio-paulista-location')
returns table (
  month text,
  total_reviews bigint,
  avg_rating numeric(4,2),
  five_star_count bigint,
  four_star_count bigint,
  three_star_count bigint,
  two_star_count bigint,
  one_star_count bigint
) language sql
security definer
set search_path = public
as $$
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
$$;
grant execute on function get_monthly_trends(text) to anon, authenticated;

-- Wrapper sem parâmetros para compatibilidade
create or replace function get_monthly_trends()
returns table (
  month text,
  total_reviews bigint,
  avg_rating numeric(4,2),
  five_star_count bigint,
  four_star_count bigint,
  three_star_count bigint,
  two_star_count bigint,
  one_star_count bigint
) language sql
security definer
set search_path = public
as $$
  select * from get_monthly_trends('cartorio-paulista-location');
$$;

-- get_reviews_by_month
create or replace function get_reviews_by_month(
  p_month text,
  p_location_id text default 'cartorio-paulista-location',
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table (
  review_id text,
  location_id text,
  rating integer,
  comment text,
  reviewer_name text,
  create_time timestamptz,
  update_time timestamptz,
  collection_source text
) language sql
security definer
set search_path = public
as $$
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
$$;
grant execute on function get_reviews_by_month(text, text, integer, integer) to anon, authenticated;

-- get_monthly_stats com p_location_id
create or replace function get_monthly_stats(
  p_month text,
  p_location_id text default 'cartorio-paulista-location'
)
returns table (
  total_reviews bigint,
  avg_rating numeric(4,2),
  five_star_percentage numeric(5,2),
  oldest_review timestamptz,
  newest_review timestamptz,
  five_star_count bigint
) language sql
security definer
set search_path = public
as $$
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
$$;
grant execute on function get_monthly_stats(text, text) to anon, authenticated;

-- Wrapper compatível com assinatura antiga
create or replace function get_monthly_stats(
  p_month text
)
returns table (
  total_reviews bigint,
  avg_rating numeric(4,2),
  five_star_percentage numeric(5,2),
  oldest_review timestamptz,
  newest_review timestamptz,
  five_star_count bigint
) language sql
security definer
set search_path = public
as $$
  select * from get_monthly_stats(p_month, 'cartorio-paulista-location');
$$;
grant execute on function get_monthly_stats(text) to anon, authenticated;

-- get_daily_trends com p_location_id
create or replace function get_daily_trends(
  p_days integer default 30,
  p_location_id text default 'cartorio-paulista-location'
)
returns table (
  day date,
  total_reviews bigint,
  avg_rating numeric(4,2),
  five_star_count bigint
) language sql
security definer
set search_path = public
as $$
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
$$;
grant execute on function get_daily_trends(integer, text) to anon, authenticated;

-- Wrapper de compatibilidade (assinatura antiga)
create or replace function get_reviews_by_month(
  p_month text,
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table (
  review_id text,
  location_id text,
  rating integer,
  comment text,
  reviewer_name text,
  create_time timestamptz,
  update_time timestamptz,
  collection_source text
) language sql
security definer
set search_path = public
as $$
  select * from get_reviews_by_month(p_month, 'cartorio-paulista-location', p_limit, p_offset);
$$;

-- Limpeza de legado baseada no dataset Apify (executar com service role)
create or replace function cleanup_legacy_from_dataset(
  p_location_id text,
  p_ids text[],
  p_urls text[]
)
returns void language plpgsql
security definer
set search_path = public
as $$
begin
  -- Arquivar linhas legacy (não-Apify ou location diferente) que não estão no dataset
  insert into reviews_legacy_archive
  select r.* from reviews r
  where (r.source <> 'apify' or r.location_id <> p_location_id)
    and not (
      (r.review_id is not null and r.review_id = any(p_ids))
      or (r.review_url is not null and r.review_url = any(p_urls))
    );

  -- Remover as mesmas linhas
  delete from reviews r
  where (r.source <> 'apify' or r.location_id <> p_location_id)
    and not (
      (r.review_id is not null and r.review_id = any(p_ids))
      or (r.review_url is not null and r.review_url = any(p_urls))
    );

  -- Unificar location_id remanescente no canônico
  update reviews set location_id = p_location_id where location_id <> p_location_id;
end $$;


