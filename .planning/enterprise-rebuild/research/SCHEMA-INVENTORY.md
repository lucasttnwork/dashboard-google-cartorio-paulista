# SCHEMA INVENTORY — Estado do Banco Supabase

> Reflete o que está **declarado nos arquivos SQL** do repositório. O estado real em produção pode divergir (ver nota no fim). Este documento é input para as migrations da Fase 0.

Data do snapshot: 2026-04-09
Fonte: `supabase/sql/init.sql`, `fix_reviews_pk.sql`, `review_collaborator_sync.sql`, `2025-09-17_apify_standardization.sql`, `EXECUTE_ESTE_SQL.sql`

---

## Extensões

- `unaccent` — normalização de acentos para full-text search
- `pg_trgm` — índices GIN trigram para busca fuzzy
- `vector` — (opcional) embeddings, depende do plano

---

## Tabelas de Referência

### `gbp_accounts`
Representa conta do Google Business Profile.
```sql
account_id text primary key
display_name text
```

### `gbp_locations`
Local associado a uma conta.
```sql
location_id text primary key
account_id  text references gbp_accounts(account_id) on delete cascade
name        text
title       text
place_id    text unique
cid         text unique
website     text
address     text
phone       text
domain      text
```

**RLS:** ❌ não habilitada
**Observação:** `location_id` é a chave de multi-tenancy futura.

---

## Tabelas de Dados Principais

### `reviews_raw`
Payloads brutos para auditoria e debug.
```sql
review_id    text primary key
location_id  text references gbp_locations(location_id) on delete cascade
payload      jsonb not null
received_at  timestamptz default now()
```
**RLS:** ❌ não habilitada

### `reviews`
Reviews normalizados.
```sql
review_id      text primary key
location_id    text references gbp_locations(location_id) on delete cascade
rating         int check (rating between 1 and 5)
comment        text
reviewer_name  text
is_anonymous   boolean
create_time    timestamptz
update_time    timestamptz
reply_text     text
reply_time     timestamptz
tsv            tsvector  -- mantido por trigger, índice GIN
```

**Índices:**
- `idx_reviews_tsv` — GIN sobre `tsv` (full-text)
- `idx_reviews_comment_trgm` — GIN `gin_trgm_ops` sobre `comment`
- `idx_reviews_location_time` — `(location_id, create_time)` (provável cobrimento de listagem cronológica)

**Trigger:** `reviews_set_tsv_trg` before insert/update of comment — mantém `tsv`.

**RLS:** ❌ não habilitada ← **CRÍTICO**

**Nota de drift:** `fix_reviews_pk.sql` e `EXECUTE_ESTE_SQL.sql` sugerem que a PK sofreu alterações não versionadas.

---

## Taxonomias

### `services`
```sql
id bigserial primary key
name text unique
synonyms text[] default '{}'
```

Seed inclui `'e-notariado'` com synonyms extensos (certificado digital, videoconferência, ICP-Brasil, token, A1/A3, etc.).

**RLS:** ❌ não habilitada

### `collaborators`
```sql
id bigserial primary key
full_name text not null
department text
position text
is_active boolean default true
aliases text[] default '{}'
created_at timestamptz default now()
updated_at timestamptz default now()
```

**Índices:**
- `idx_collaborators_full_name_trgm` — GIN trigram
- `idx_collaborators_department`
- `idx_collaborators_is_active`
- `idx_collaborators_created_at` DESC

**Trigger:** `update_collaborators_updated_at` mantém `updated_at`.

**RLS:** ✅ habilitada, com policies permissivas:
- `"Allow read access to collaborators"` — SELECT para `authenticated`
- `"Allow write access to collaborators"` — ALL para `service_role OR authenticated`

**Seeds:** 9 colaboradores iniciais (Ana Sophia, Karen Figueiredo, Kaio Gomes, Letícia Andreza, Fabiana Medeiros, João Santos, Maria Silva, Pedro Costa, Carla Oliveira).

---

## Relacionamentos N:N

### `review_services`
```sql
review_id text references reviews(review_id) on delete cascade
service_id bigint references services(id) on delete cascade
confidence real check (confidence between 0 and 1)
primary key (review_id, service_id)
```
**RLS:** ❌ não habilitada

### `review_collaborators`
```sql
review_id text references reviews(review_id) on delete cascade
collaborator_id bigint references collaborators(id) on delete cascade
mention_snippet text
match_score real check (match_score between 0 and 1)
primary key (review_id, collaborator_id)
```
**RLS:** ❌ não habilitada
**Uso:** população via NLP (classifier edge function + `review_alias_imputer.py`).

---

## Labels

### `review_labels`
```sql
review_id text primary key references reviews(review_id) on delete cascade
sentiment review_sentiment default 'unknown'
toxicity  real
is_enotariado boolean default false
classifier_version text
```

Enum `review_sentiment`: `'pos' | 'neu' | 'neg' | 'unknown'`.
**RLS:** ❌ não habilitada

---

## Agregações

### `mv_monthly` (materialized view)
```sql
select
  date_trunc('month', r.create_time) as month,
  r.location_id,
  count(*)                                          as total_reviews,
  avg(r.rating)::numeric(4,2)                       as avg_rating,
  sum(case when rl.is_enotariado then 1 else 0 end) as reviews_enotariado,
  avg(case when rl.is_enotariado then r.rating end)::numeric(4,2) as avg_rating_enotariado
from reviews r
left join review_labels rl using (review_id)
group by 1,2
```

**Refresh:** não há schedule declarado no SQL. Refresh é manual hoje.

---

## Fila de Processamento NLP

### `nlp_queue`
```sql
id bigserial primary key
review_id text references reviews(review_id) on delete cascade
status text check (status in ('pending','processing','failed'))
attempts int default 0
available_at timestamptz default now()
locked_by text
locked_at timestamptz
last_error text
created_at timestamptz default now()
updated_at timestamptz default now()
```

**Índices:**
- `idx_nlp_queue_status_available` on `(status, available_at)`
- `uq_nlp_queue_review` UNIQUE on `review_id`

**Trigger:** `nlp_queue_set_updated_at`.

**RLS:** ❌ não habilitada

---

## Funções Postgres / RPCs

### NLP queue management
- `enqueue_nlp_review(p_review_id text)` — inserts/upserts pending.
- `claim_nlp_review(p_worker_id text)` — atomic claim via `FOR UPDATE SKIP LOCKED`.
- `complete_nlp_review(p_review_id text)` — delete da fila.
- `fail_nlp_review(p_review_id text, p_error text)` — marca failed, incrementa attempts, reprograma em 5min.

### Triggers helpers
- `reviews_set_tsv()` — calcula `tsv` de `reviews.comment`.
- `update_updated_at_column()` — genérico para `updated_at`.
- `set_updated_at()` — variação em plpgsql.

### Métricas expostas ao frontend (RPC)

**`get_reviews_stats()`**
```sql
returns table (
  total_reviews bigint,
  avg_rating numeric(4,2),
  oldest_review timestamptz,
  newest_review timestamptz,
  five_star_count bigint,
  five_star_percentage numeric(5,2)
)
security definer
set search_path = public
```
`GRANT EXECUTE ON FUNCTION get_reviews_stats() TO anon, authenticated;`
**Risco:** função exposta a `anon` → qualquer pessoa com a anon key consulta total de reviews do cartório.

**`get_recent_reviews(limit_param integer default 10)`**
```sql
returns table (
  review_id text, location_id text, rating integer,
  comment text, reviewer_name text,
  create_time timestamptz, update_time timestamptz,
  collection_source text  -- hardcoded 'google'
)
security definer
set search_path = public
```
`GRANT EXECUTE ON FUNCTION get_recent_reviews(integer) TO anon, authenticated;`
**Risco:** expõe todos os reviews e PII do `reviewer_name` a usuários anônimos.

**`get_monthly_trends()`**
```sql
returns table (
  month text,
  total_reviews bigint,
  avg_rating numeric(4,2),
  five_star_count, four_star_count, three_star_count, two_star_count, one_star_count bigint
)
```
**Assumido grant similar** — verificar em produção.

**`get_collaborators_stats()`**
```sql
returns table (
  total_collaborators bigint,
  active_collaborators bigint,
  inactive_collaborators bigint,
  top_department text
)
```

---

## Resumo do Estado RLS

| Tabela                  | RLS habilitada | Policies atuais                                 | Risco |
|-------------------------|:--------------:|-------------------------------------------------|:-----:|
| `gbp_accounts`          | ❌             | —                                                | 🔴    |
| `gbp_locations`         | ❌             | —                                                | 🔴    |
| `reviews`               | ❌             | —                                                | 🔴    |
| `reviews_raw`           | ❌             | —                                                | 🔴    |
| `services`              | ❌             | —                                                | 🟡    |
| `collaborators`         | ✅             | read=authenticated, write=service_role/authenticated | 🟡    |
| `review_services`       | ❌             | —                                                | 🔴    |
| `review_collaborators`  | ❌             | —                                                | 🔴    |
| `review_labels`         | ❌             | —                                                | 🔴    |
| `nlp_queue`             | ❌             | —                                                | 🟡    |
| `mv_monthly` (view)     | N/A            | herda do SELECT subjacente                       | 🔴    |

Legenda: 🔴 alto (dados sensíveis / PII expostos) · 🟡 médio (dados não sensíveis mas sem controle) · 🟢 OK

---

## Arquivos SQL a consolidar em migrations (Fase 0)

Ordem proposta de portagem (timestamp será atribuído durante a execução):

1. `init.sql` → `20260409000001_baseline.sql`
2. `fix_reviews_pk.sql` → `20260409000002_fix_reviews_pk.sql`
3. `review_collaborator_sync.sql` → `20260409000003_review_collaborator_sync.sql`
4. `2025-09-17_apify_standardization.sql` → `20260409000004_apify_standardization.sql`
5. `EXECUTE_ESTE_SQL.sql` → `20260409000005_execute_este_sql_hotfix.sql`
6. (nova) `20260409000006_rls_lockdown.sql` — habilita RLS em todas as tabelas com default deny, revoga grants a `anon`.
7. (nova) `20260409000007_auth_profiles.sql` — tabela `user_profiles` + trigger do Auth.

A migration baseline deve ser testada em projeto staging **antes** de aplicada em produção, garantindo que o estado atual seja reproduzido 1:1.

---

## Verificações pendentes contra o banco real

Estes pontos não podem ser confirmados apenas pelo SQL do repo; requerem inspeção no painel Supabase ou via `psql`:

- [ ] As RPCs realmente estão com `grant execute to anon`?
- [ ] A PK atual de `reviews` é a declarada em `init.sql` ou a de `EXECUTE_ESTE_SQL.sql`?
- [ ] `pg_cron` está instalado? Há jobs registrados?
- [ ] Há triggers ou objetos criados fora do versionamento?
- [ ] `mv_monthly` está sendo refreshada? Qual a frequência?
- [ ] Quantas linhas há em `reviews`, `review_collaborators`, `reviews_raw`?
- [ ] Há schemas além de `public` em uso?
- [ ] As Edge Functions estão deployadas? Quais?

A resolução desses pontos é o primeiro passo da Fase 0, Task 0.0 (snapshot do estado real).
