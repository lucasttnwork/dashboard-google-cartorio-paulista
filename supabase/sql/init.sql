-- Supabase/Postgres schema for GBP reviews ingestion, NLP classification and dashboards
-- Extensions
create extension if not exists unaccent;
create extension if not exists pg_trgm;
-- Optional: embeddings for semantic analysis
do $$ begin
  execute 'create extension if not exists vector';
exception when others then
  -- vector may not be available in all Postgres plans
  null;
end $$;

-- Reference tables
create table if not exists gbp_accounts (
  account_id text primary key,
  display_name text
);

create table if not exists gbp_locations (
  location_id text primary key,
  account_id  text references gbp_accounts(account_id) on delete cascade,
  name        text,
  title       text,
  place_id    text unique,
  cid         text unique,
  website     text,
  address     text,
  phone       text,
  domain      text
);

-- Raw payloads for audit/debug
create table if not exists reviews_raw (
  review_id    text primary key,
  location_id  text references gbp_locations(location_id) on delete cascade,
  payload      jsonb not null,
  received_at  timestamptz default now()
);

-- Normalized reviews
create table if not exists reviews (
  review_id      text primary key,
  location_id    text references gbp_locations(location_id) on delete cascade,
  rating         int check (rating between 1 and 5),
  comment        text,
  reviewer_name  text,
  is_anonymous   boolean,
  create_time    timestamptz,
  update_time    timestamptz,
  reply_text     text,
  reply_time     timestamptz,
  tsv tsvector
);

create index if not exists idx_reviews_tsv on reviews using gin(tsv);
create index if not exists idx_reviews_comment_trgm on reviews using gin (comment gin_trgm_ops);
create index if not exists idx_reviews_location_time on reviews(location_id, create_time);

-- Trigger to maintain tsv (since unaccent/fts functions are not immutable)
create or replace function reviews_set_tsv()
returns trigger language plpgsql as $$
begin
  new.tsv := setweight(to_tsvector('portuguese', unaccent(coalesce(new.comment, ''))), 'A');
  return new;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'reviews_set_tsv_trg'
  ) then
    create trigger reviews_set_tsv_trg
    before insert or update of comment on reviews
    for each row execute function reviews_set_tsv();
  end if;
end $$;

-- Services taxonomy
create table if not exists services (
  id bigserial primary key,
  name text unique,
  synonyms text[] default '{}'::text[]
);

-- Collaborators
create table if not exists collaborators (
  id bigserial primary key,
  full_name text not null,
  department text,
  position text,
  is_active boolean default true,
  aliases text[] default '{}'::text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for collaborators
create index if not exists idx_collaborators_full_name_trgm on collaborators using gin (full_name gin_trgm_ops);
create index if not exists idx_collaborators_department on collaborators(department);
create index if not exists idx_collaborators_is_active on collaborators(is_active);
create index if not exists idx_collaborators_created_at on collaborators(created_at desc);

-- Updated_at trigger for collaborators
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'update_collaborators_updated_at'
  ) then
    create trigger update_collaborators_updated_at
    before update on collaborators
    for each row execute function update_updated_at_column();
  end if;
end $$;

-- RLS Policies for collaborators (if RLS is enabled)
alter table collaborators enable row level security;

-- Allow read access to authenticated users
create policy "Allow read access to collaborators" on collaborators
for select using (auth.role() = 'authenticated');

-- Allow insert/update/delete for service role or authenticated users with proper permissions
create policy "Allow write access to collaborators" on collaborators
for all using (auth.role() = 'service_role' or auth.role() = 'authenticated');

-- NLP links
create table if not exists review_services (
  review_id text references reviews(review_id) on delete cascade,
  service_id bigint references services(id) on delete cascade,
  confidence real check (confidence between 0 and 1),
  primary key (review_id, service_id)
);

create table if not exists review_collaborators (
  review_id text references reviews(review_id) on delete cascade,
  collaborator_id bigint references collaborators(id) on delete cascade,
  mention_snippet text,
  match_score real check (match_score between 0 and 1),
  primary key (review_id, collaborator_id)
);

-- Labels
do $$ begin
  if not exists (select 1 from pg_type where typname = 'review_sentiment') then
    create type review_sentiment as enum ('pos','neu','neg','unknown');
  end if;
end $$;

create table if not exists review_labels (
  review_id text primary key references reviews(review_id) on delete cascade,
  sentiment review_sentiment default 'unknown',
  toxicity  real,
  is_enotariado boolean default false,
  classifier_version text
);

-- Monthly aggregates
create materialized view if not exists mv_monthly as
select
  date_trunc('month', r.create_time) as month,
  r.location_id,
  count(*)                                 as total_reviews,
  avg(r.rating)::numeric(4,2)              as avg_rating,
  sum(case when rl.is_enotariado then 1 else 0 end) as reviews_enotariado,
  avg(case when rl.is_enotariado then r.rating end)::numeric(4,2) as avg_rating_enotariado
from reviews r
left join review_labels rl using (review_id)
group by 1,2;

-- Queue (database-backed minimal queue for NLP processing)
create table if not exists nlp_queue (
  id bigserial primary key,
  review_id text references reviews(review_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','failed')),
  attempts int not null default 0,
  available_at timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_nlp_queue_status_available on nlp_queue(status, available_at);
create unique index if not exists uq_nlp_queue_review on nlp_queue(review_id);

-- Simple updated_at trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'nlp_queue_set_updated_at'
  ) then
    create trigger nlp_queue_set_updated_at
    before update on nlp_queue
    for each row execute function set_updated_at();
  end if;
end $$;

-- RPCs for queue management
create or replace function enqueue_nlp_review(p_review_id text)
returns void language plpgsql as $$
begin
  insert into nlp_queue (review_id, status)
  values (p_review_id, 'pending')
  on conflict (review_id) do update set status = 'pending', available_at = now(), last_error = null;
end $$;

create or replace function claim_nlp_review(p_worker_id text)
returns table (
  id bigint,
  review_id text,
  attempts int
) language plpgsql as $$
declare v_id bigint; v_review text; v_attempts int;
begin
  select id, review_id, attempts into v_id, v_review, v_attempts
  from nlp_queue
  where status = 'pending' and available_at <= now()
  order by available_at asc
  for update skip locked
  limit 1;

  if v_id is null then
    return;
  end if;

  update nlp_queue
  set status = 'processing', locked_by = p_worker_id, locked_at = now()
  where id = v_id;

  return query select v_id::bigint, v_review::text, v_attempts::int;
end $$;

create or replace function complete_nlp_review(p_review_id text)
returns void language sql as $$
  delete from nlp_queue where review_id = p_review_id;
$$;

create or replace function fail_nlp_review(p_review_id text, p_error text)
returns void language plpgsql as $$
begin
  update nlp_queue
  set status = 'failed', attempts = attempts + 1, available_at = now() + interval '5 minutes', last_error = p_error
  where review_id = p_review_id;
end $$;

-- Seeds for services taxonomy (e-Notariado synonyms)
insert into services(name, synonyms) values
  ('e-notariado', array['e-notariado','enotariado','e notariado','e-notarial','assinatura digital','certificado digital','videoconferência','videoconferencia','ICP-Brasil','ICP Brasil','token','A1','A3','escritura digital','procuração eletrônica','procuracao eletronica','reconhecimento por videoconferência'])
on conflict (name) do nothing;

-- Sample data for testing (can be removed in production)
-- Insert sample GBP account and location
insert into gbp_accounts (account_id, display_name) values
  ('cartorio-paulista', 'Cartório Paulista')
on conflict (account_id) do nothing;

insert into gbp_locations (location_id, account_id, name, title, place_id, cid, website, address, phone) values
  ('cartorio-paulista-location', 'cartorio-paulista', 'Cartório Paulista', 'Cartório Paulista - 2º Cartório de Notas de São Paulo', 'ChIJ_sample_place_id', '12345678901234567890', 'https://cartoriopaulista.com.br', 'Rua da Liberdade, 123 - Liberdade, São Paulo - SP', '(11) 3333-4444')
on conflict (location_id) do nothing;

-- Insert sample collaborators
insert into collaborators (full_name, department, position, is_active, aliases) values
  ('Ana Sophia', 'E-notariado', 'Tabeliã Substituta', true, array['Ana', 'Ana Sofia']),
  ('Karen Figueiredo', 'E-notariado', 'Escrevente', true, array['Karen', 'Karen Fig']),
  ('Kaio Gomes', 'E-notariado', 'Escrevente', true, array['Kaio', 'Caio']),
  ('Letícia Andreza', 'E-notariado', 'Escrevente', true, array['Leticia', 'Letícia']),
  ('Fabiana Medeiros', 'E-notariado', 'Escrevente', true, array['Fabiana', 'Fabi']),
  ('João Santos', 'Administrativo', 'Auxiliar', true, array['João', 'Joao']),
  ('Maria Silva', 'Atendimento', 'Recepcionista', true, array['Maria']),
  ('Pedro Costa', 'E-notariado', 'Estagiário', true, array['Pedro']),
  ('Carla Oliveira', 'E-notariado', 'Supervisora', true, array['Carla'])
on conflict (full_name) do nothing;

-- Insert sample reviews
insert into reviews (review_id, location_id, rating, comment, reviewer_name, is_anonymous, create_time, update_time) values
  ('review_001', 'cartorio-paulista-location', 5, 'Excelente atendimento! A Ana Sophia foi muito atenciosa e resolveu meu problema rapidamente.', 'João Silva', false, '2025-09-01T10:30:00Z', '2025-09-01T10:30:00Z'),
  ('review_002', 'cartorio-paulista-location', 5, 'Serviço de e-notariado muito eficiente. Karen Figueiredo me orientou perfeitamente.', 'Maria Santos', false, '2025-08-31T14:20:00Z', '2025-08-31T14:20:00Z'),
  ('review_003', 'cartorio-paulista-location', 4, 'Bom atendimento, porém demorou um pouco para ser atendido.', 'Pedro Oliveira', false, '2025-08-30T09:15:00Z', '2025-08-30T09:15:00Z'),
  ('review_004', 'cartorio-paulista-location', 5, 'Equipe muito profissional. Recomendo o Cartório Paulista!', 'Ana Costa', false, '2025-08-29T16:45:00Z', '2025-08-29T16:45:00Z'),
  ('review_005', 'cartorio-paulista-location', 5, 'Atendimento rápido e eficiente. Letícia Andreza foi excelente!', 'Carlos Mendes', false, '2025-08-28T11:00:00Z', '2025-08-28T11:00:00Z'),
  ('review_006', 'cartorio-paulista-location', 5, 'Kaio Gomes foi muito profissional e me ajudou com o e-notariado.', 'Fernanda Lima', false, '2025-08-27T15:30:00Z', '2025-08-27T15:30:00Z'),
  ('review_007', 'cartorio-paulista-location', 5, 'Fabiana Medeiros tem um conhecimento incrível! Muito satisfeita.', 'Roberto Alves', false, '2025-08-26T13:20:00Z', '2025-08-26T13:20:00Z'),
  ('review_008', 'cartorio-paulista-location', 3, 'Atendimento ok, mas poderia ser mais ágil.', 'Lucia Ferreira', false, '2025-08-25T10:45:00Z', '2025-08-25T10:45:00Z'),
  ('review_009', 'cartorio-paulista-location', 5, 'Serviço impecável! Toda a equipe está de parabéns.', 'Marcos Pereira', false, '2025-08-24T17:15:00Z', '2025-08-24T17:15:00Z'),
  ('review_010', 'cartorio-paulista-location', 5, 'Ana Sophia é uma profissional exemplar. Muito competente!', 'Sandra Rocha', false, '2025-08-23T12:00:00Z', '2025-08-23T12:00:00Z')
on conflict (review_id) do nothing;

-- Link collaborators to reviews (mentions)
insert into review_collaborators (review_id, collaborator_id, mention_snippet, match_score) values
  ('review_001', (select id from collaborators where full_name = 'Ana Sophia'), 'Ana Sophia foi muito atenciosa', 0.95),
  ('review_002', (select id from collaborators where full_name = 'Karen Figueiredo'), 'Karen Figueiredo me orientou perfeitamente', 0.98),
  ('review_005', (select id from collaborators where full_name = 'Letícia Andreza'), 'Letícia Andreza foi excelente', 0.92),
  ('review_006', (select id from collaborators where full_name = 'Kaio Gomes'), 'Kaio Gomes foi muito profissional', 0.90),
  ('review_007', (select id from collaborators where full_name = 'Fabiana Medeiros'), 'Fabiana Medeiros tem um conhecimento incrível', 0.88),
  ('review_010', (select id from collaborators where full_name = 'Ana Sophia'), 'Ana Sophia é uma profissional exemplar', 0.93)
on conflict (review_id, collaborator_id) do nothing;

-- Function to get collaborators stats
create or replace function get_collaborators_stats()
returns table (
  total_collaborators bigint,
  active_collaborators bigint,
  inactive_collaborators bigint,
  top_department text
) language sql as $$
  select
    count(*) as total_collaborators,
    count(case when is_active then 1 end) as active_collaborators,
    count(case when not is_active then 1 end) as inactive_collaborators,
    (select department
     from collaborators
     where department is not null
     group by department
     order by count(*) desc
     limit 1) as top_department
  from collaborators;
$$;

-- Function to get reviews stats (required by frontend)
create or replace function get_reviews_stats()
returns table (
  total_reviews bigint,
  avg_rating numeric(4,2),
  oldest_review timestamptz,
  newest_review timestamptz,
  five_star_count bigint,
  five_star_percentage numeric(5,2)
) language sql as $$
  select
    count(*) as total_reviews,
    avg(rating)::numeric(4,2) as avg_rating,
    min(create_time) as oldest_review,
    max(create_time) as newest_review,
    count(case when rating = 5 then 1 end) as five_star_count,
    case when count(*) > 0 then
      (count(case when rating = 5 then 1 end) * 100.0 / count(*))::numeric(5,2)
    else 0
    end as five_star_percentage
  from reviews;
$$;

-- Function to get recent reviews with limit
create or replace function get_recent_reviews(limit_param integer default 10)
returns table (
  review_id text,
  location_id text,
  rating integer,
  comment text,
  reviewer_name text,
  create_time timestamptz,
  update_time timestamptz,
  collection_source text
) language sql as $$
  select
    r.review_id,
    r.location_id,
    r.rating,
    r.comment,
    r.reviewer_name,
    r.create_time,
    r.update_time,
    'google' as collection_source
  from reviews r
  order by r.create_time desc
  limit limit_param;
$$;

-- Function to get monthly trends
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
) language sql as $$
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
  where create_time >= date_trunc('month', current_date - interval '11 months')
  group by date_trunc('month', create_time)
  order by month desc;
$$;

-- Function to get collaborator mentions with rankings
create or replace function get_collaborator_mentions()
returns table (
  full_name text,
  department text,
  mentions bigint,
  avg_rating_when_mentioned numeric(4,2),
  latest_mention timestamptz
) language sql as $$
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
$$;

-- Alerts table
create table if not exists review_alerts (
  id bigserial primary key,
  review_id text references reviews(review_id) on delete cascade,
  alert_type text not null check (alert_type in ('low_rating','negative_sentiment')),
  sent_at timestamptz not null default now(),
  channel text default 'slack',
  payload jsonb,
  unique (review_id, alert_type)
);



