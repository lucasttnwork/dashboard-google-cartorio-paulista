-- Helpers para normalização e escape
create or replace function normalize_unaccent_lower(text) returns text
language sql immutable strict as $$
  select lower(unaccent(coalesce($1, '')));
$$;

create or replace function escape_regex_special(text) returns text
language sql immutable strict as $$
  select regexp_replace($1, '([\\\.\+\*\?\|\(\)\[\]\{\}\^\$\-])', '\\\\\1', 'g');
$$;

create or replace function escape_like_special(text) returns text
language sql immutable strict as $$
  select replace(replace(replace($1, '\\', '\\\\'), '%', '\\%'), '_', '\\_');
$$;

-- Retorna a lista de aliases (incluindo nome completo) para um colaborador
create or replace function collaborator_alias_entries(p_collaborator_id bigint)
returns table(alias text, is_full_name boolean)
language plpgsql stable as $$
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
$$;

-- Sincroniza uma review com os colaboradores ativos (ou um colaborador específico)
create or replace function match_review_collaborators(
  p_review_id text,
  p_review_comment text,
  p_target_collaborator bigint default null,
  p_context_window integer default 40
) returns void
language plpgsql volatile as $$
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
$$;

-- Tipos auxiliares para a fila
do $$ begin
  if not exists (select 1 from pg_type where typname = 'review_collaborator_job_type') then
    create type review_collaborator_job_type as enum ('review','collaborator');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'review_collaborator_job_status') then
    create type review_collaborator_job_status as enum ('pending','processing','completed','failed');
  end if;
end $$;

-- Tabela leve para enfileirar trabalhos de correlação
create table if not exists review_collaborator_jobs (
  id bigserial primary key,
  job_type review_collaborator_job_type not null,
  job_status review_collaborator_job_status not null default 'pending',
  review_id text,
  collaborator_id bigint,
  comment text,
  scheduled_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_review_collaborator_jobs_review
  on review_collaborator_jobs(job_type, review_id)
  where review_id is not null;

create unique index if not exists uq_review_collaborator_jobs_collaborator
  on review_collaborator_jobs(job_type, collaborator_id)
  where collaborator_id is not null;

create index if not exists idx_review_collaborator_jobs_status_scheduled
  on review_collaborator_jobs(job_status, scheduled_at);

-- Enfileira uma review para o processamento
create or replace function enqueue_review_collaborator_job(
  p_review_id text,
  p_comment text,
  p_delay interval default '0 seconds'
) returns void
language plpgsql stable as $$
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
$$;

-- Enfileira um colaborador para reprocessar aliases
create or replace function enqueue_collaborator_refresh_job(
  p_collaborator_id bigint,
  p_delay interval default '30 seconds'
) returns void
language plpgsql stable as $$
begin
  if p_collaborator_id is null then
    return;
  end if;

  insert into review_collaborator_jobs(
    job_type,
    collaborator_id,
    job_status,
    scheduled_at,
    updated_at
  )
  values (
    'collaborator',
    p_collaborator_id,
    'pending',
    now() + p_delay,
    now()
  )
  on conflict (job_type, collaborator_id) do update
    set scheduled_at = least(review_collaborator_jobs.scheduled_at, excluded.scheduled_at),
        job_status = 'pending',
        attempt_count = 0,
        updated_at = now();
end;
$$;

-- Processador de jobs (rodar via scheduler ou manualmente)
create or replace function process_review_collaborator_jobs(p_limit integer default 100)
returns table (processed_jobs integer, errors text[])
language plpgsql volatile as $$
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
$$;

-- Dispara o job sempre que uma review é inserida/atualizada
create or replace function reviews_match_collaborators_trigger() returns trigger
language plpgsql stable as $$
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
$$;

drop trigger if exists trg_reviews_match_collaborators on reviews;
create trigger trg_reviews_match_collaborators
  after insert or update on reviews
  for each row
  execute function reviews_match_collaborators_trigger();

-- Reprocessa os reviews que contêm uma nova alias (commit ao próprio colaborador)
create or replace function reprocess_reviews_for_collaborator(p_collaborator_id bigint) returns void
language plpgsql stable as $$
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
$$;

-- Trigger para reagir a novos aliases/nome completo
create or replace function collaborator_alias_trigger() returns trigger
language plpgsql stable as $$
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
$$;

drop trigger if exists trg_collaborator_aliases on collaborators;
create trigger trg_collaborator_aliases
  after insert or update on collaborators
  for each row
  execute function collaborator_alias_trigger();

