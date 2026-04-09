# Production Snapshot — 2026-04-09

> Estado real do banco Supabase `bugpetfkyoraidyxmzxu` capturado via Management API em 2026-04-09. Fonte de verdade para a migration baseline. Tudo aqui foi obtido por `POST /v1/projects/{ref}/database/query` com o access token fornecido pelo Senhor.

---

## 1. Projeto

- **Project ref:** `bugpetfkyoraidyxmzxu`
- **Nome:** Cartório Analytcs - Google My Business
- **Organização:** `ilsjhrvlafairkefzjik`
- **Região:** South America (São Paulo)
- **Plano:** Free
- **Criado:** 2025-08-28

## 2. Extensões instaladas

| Extensão | Versão | Uso |
|---|---|---|
| `pg_graphql` | 1.5.11 | nativa Supabase |
| `pg_stat_statements` | 1.11 | nativa Supabase |
| `pg_trgm` | 1.6 | busca fuzzy (usada) |
| `pgcrypto` | 1.3 | nativa Supabase |
| `plpgsql` | 1.0 | nativa Supabase |
| `supabase_vault` | 0.3.1 | nativa Supabase (segredos no DB) |
| `unaccent` | 1.1 | normalização (usada) |
| `uuid-ossp` | 1.1 | nativa Supabase |
| `vector` | 0.8.0 | embeddings (instalada mas não usada pelas tabelas conhecidas) |

**Não instaladas (confirmando Plano Free):**
- `pg_cron` — cron dentro do Postgres ❌
- `pg_net` — HTTP calls do Postgres ❌
- `http` — variação de pg_net ❌

**Impacto:** a automação por `pg_cron` proposta na Fase 4 original **não é viável** neste plano. Precisamos de cron externo (Vercel Cron, Railway, GitHub Actions) ou upgrade para Pro ($25/mês).

---

## 3. Tabelas em `public`

| Tabela | RLS | Linhas | Observação |
|---|:---:|---:|---|
| `reviews` | ❌ | **5372** | core |
| `reviews_raw` | ✅ | **5372** | payloads brutos |
| `reviews_backup_cp` | ❌ | **16360** | backup histórico (3× reviews!) |
| `reviews_legacy_archive` | ❌ | **5877** | arquivo antigo |
| `reviews_raw_legacy_archive` | ❌ | — | arquivo antigo |
| `collaborators` | ❌ | **17** | core |
| `review_collaborators` | ❌ | **2594** | N:N |
| `review_collaborators_backup_cp` | ❌ | **1405** | backup histórico |
| `review_collaborator_jobs` | ❌ | — | fila de jobs |
| `review_labels` | ✅ | — | NLP labels |
| `review_services` | ✅ | — | N:N services |
| `services` | ✅ | — | taxonomia |
| `review_alerts` | ✅ | 0 | alertas |
| `collection_runs` | ✅ | **16** | log de execuções |
| `monitoring_config` | ✅ | — | config |
| `nlp_queue` | ✅ | — | fila NLP |
| `gbp_accounts` | ✅ | — | GBP |
| `gbp_locations` | ✅ | — | GBP |
| `mv_monthly` | view | — | materialized view |

**Tabelas NÃO declaradas no `supabase/sql/init.sql`:**
- `collection_runs`
- `monitoring_config`
- `review_alerts`
- `review_collaborator_jobs`
- `reviews_backup_cp`, `review_collaborators_backup_cp`
- `reviews_legacy_archive`, `reviews_raw_legacy_archive`

**Conclusão:** há schema drift massivo entre o repo e a produção. Migrations foram aplicadas manualmente sem versionamento. A migration baseline da Fase 0 precisa incluir o estado REAL, não o init.sql.

**Dado sensível em backups:** há **16.360 reviews** em `reviews_backup_cp` e **1.405 menções** em `review_collaborators_backup_cp`. Nenhuma tem RLS. **Qualquer pessoa com anon key tem acesso irrestrito a todos os backups.** Triagem necessária: esses backups ainda têm valor ou podem ser arquivados/dropados?

---

## 4. Estado das Policies RLS

### 🔴 Tabelas com RLS habilitada mas policies são **teatro de segurança**

Várias tabelas têm `rowsecurity = true` mas as policies permitem acesso público via `USING (true)`. Efeito líquido: **idêntico a RLS desabilitada**.

**Exemplos concretos:**

```
reviews (RLS OFF - no repo diz ON, prod diz OFF):
  reviews_insert_policy  INSERT  public  qual=null  ← qualquer um insere
  reviews_read_policy    SELECT  public  qual=true  ← qualquer um lê
  reviews_update_policy  UPDATE  public  qual=true  ← qualquer um atualiza

review_collaborators (RLS OFF):
  read_policy   SELECT  public  qual=true
  update_policy UPDATE  public  qual=true
  insert_policy INSERT  public  qual=null

reviews_raw (RLS ON):
  reviews_raw_insert_policy         INSERT public qual=null
  reviews_raw_insert_cartorio_anon  INSERT {anon} qual=null         ← explicitamente anon!
  reviews_raw_update_cartorio_anon  UPDATE {anon} qual=(location_id='cartorio_paulista_main')
                                                  ^^^
                                                  ↑ valor diferente do usado na aplicação ('cartorio-paulista-location')

collaborators (RLS OFF):
  collaborators_insert_policy INSERT public qual=null
  collaborators_read_policy   SELECT public qual=true
  collaborators_update_policy UPDATE public qual=authenticated
```

### ✅ Tabelas com RLS efetiva:

```
collection_runs, monitoring_config, review_alerts, nlp_queue:
  read_policy   SELECT public qual=(auth.role() = 'authenticated')
  write/ALL     service_role apenas
```

### Resumo das ameaças abertas

Com a anon key (`sb_publishable_REDACTED_IN_GIT_HISTORY`) que está no bundle JS do frontend, um atacante pode:

1. **Ler** todos os 5.372 reviews (incluindo nome do reviewer, comentário completo, timestamp).
2. **Ler** todas as 2.594 menções a colaboradores (incluindo snippet mencionando o nome).
3. **Ler** os 16.360 reviews do backup histórico.
4. **Inserir** reviews falsos via `reviews_insert_policy` (qual=null).
5. **Atualizar** reviews existentes via `reviews_update_policy` (qual=true).
6. **Inserir/atualizar** menções falsas a colaboradores via `review_collaborators_*_policy`.
7. **Inserir** labels arbitrários via `review_labels_insert_policy`.
8. **Inserir** em `reviews_raw` via política explícita `reviews_raw_insert_cartorio_anon`.

É um **vazamento de PII + vetor de manipulação de dados operacionais**. O sistema atual está efetivamente sem autorização.

---

## 5. Funções Postgres e Grants

Todas as funções em `public` têm `grant execute to {anon, authenticated, service_role}`. O grant a `anon` é o problema.

### Funções de leitura expostas a anon (vazamento de dados)
- `get_reviews_stats` (security_definer)
- `get_recent_reviews` (security_definer)
- `get_recent_reviews_with_fallback` (security_definer)
- `get_reviews_by_month` (security_definer)
- `get_monthly_stats` (security_definer)
- `get_monthly_trends` (security_definer)
- `get_monthly_trends_ext` (security_definer)
- `get_daily_trends` (security_definer)
- `get_daily_trends_for_month` (security_definer)
- `get_collaborators_stats` (security_definer)
- `get_collaborator_mentions` (security_definer)
- `get_collaborator_mentions_by_month` (security_definer)
- `search_reviews` (security_definer)
- `get_pending_alerts` (security_definer)

### 🔴 Funções de ESCRITA/AÇÃO expostas a anon (vetores de ataque ativos)
- **`persist_reviews_atomic`** (security_definer) — **permite anônimo escrever reviews**
- **`update_location_metrics`** (security_definer) — **permite anônimo alterar métricas**
- **`refresh_monthly_view`** (security_definer) — **permite DoS refreshando view em loop**
- **`cleanup_legacy_from_dataset`** (security_definer) — **permite anônimo limpar dados legado**
- **`reprocess_reviews_for_collaborator`** — **permite disparar reprocessamento**
- **`create_auto_alerts`** (security_definer)
- **`process_collaborator_mentions`** (security_definer)
- **`enqueue_review_collaborator_job`**
- **`enqueue_collaborator_refresh_job`**
- **`enqueue_nlp_review`** (security_definer)
- **`claim_nlp_review`** (security_definer) — permite sequestrar jobs da fila
- **`complete_nlp_review`** (security_definer)
- **`fail_nlp_review`** (security_definer)

### Helpers internos (também expostos, baixo risco direto)
- `check_column_exists`, `check_table_column` (security_definer) — expõe estrutura
- `collaborator_alias_entries`, `collaborator_alias_trigger`
- `find_collaborator_mentions`, `match_review_collaborators`
- `reviews_match_collaborators_trigger`
- `reviews_set_tsv`
- `set_updated_at`
- `normalize_unaccent_lower`
- `escape_like_special`, `escape_regex_special`
- `process_review_collaborator_jobs`

### Funções de extensões (não é nosso problema, vem com pg_trgm/vector)
- Família pg_trgm: `gin_extract_*`, `gtrgm_*`, `similarity*`, `word_similarity*`, `strict_word_similarity*`, `set_limit`, `show_limit`, `show_trgm`
- Família vector/pgvector: `array_to_halfvec`, `vector_*`, `halfvec_*`, `sparsevec_*`, `l2_*`, `cosine_*`, `hamming_*`, `jaccard_*`, `inner_product`, `binary_quantize`, `hnsw*`, `ivfflat*`, `subvector`
- `unaccent*`, `avg`, `sum`

---

## 6. Edge Functions deployadas (9 ativas)

| ID | Nome | Status | Versão | Última atualização |
|---|---|---|---:|---|
| `c732d52b-…` | `dataforseo-lookup` | ACTIVE | 5 | 2025-08-29 |
| `59f21b42-…` | `auto-collector` | ACTIVE | 5 | 2025-09-24 |
| `8cdb2064-…` | `scheduler` | ACTIVE | 4 | 2025-12-03 |
| `70b7667a-…` | `alerts` | ACTIVE | 3 | 2025-09-01 |
| `bde8eb58-…` | `classifier` | ACTIVE | 3 | 2025-09-01 |
| `18f3a283-…` | `dataforseo-reviews` | ACTIVE | 3 | 2025-09-01 |
| `c5312566-…` | `gbp-backfill` | ACTIVE | 3 | 2025-09-01 |
| `6fba601d-…` | `gbp-webhook` | ACTIVE | 3 | 2025-09-01 |
| `748322cf-…` | `review-collaborator-jobs` | ACTIVE | 2 | 2025-12-03 |

**Presentes no repo mas NÃO deployadas:**
- `apply-migration` — correto, não deve ser deployado (seria vetor de ataque no runtime).
- `collaborators` — o adapter do frontend faz referência, mas a função não está ativa.
- `_shared` — utilitários, não é função deployável.

**Conclusão:** 9 funções deployadas, versões espalhadas entre agosto e dezembro de 2025. Nenhuma atualização desde então. `scheduler` e `review-collaborator-jobs` receberam update recente (dezembro), o que sugere que foram as últimas tocadas.

---

## 7. Implicações para o planejamento

### Atualização das decisões técnicas

**D3 — RLS RESTRICTIVE (inalterado)**
Confirmado ainda mais crítico: as policies atuais usam `USING (true)` (permit all). Migration `rls_lockdown` precisa não só habilitar RLS, mas **dropar todas as policies existentes** e recriá-las com `USING (false)` default-deny.

**D4 — Migrations (reforço)**
A migration baseline precisa capturar 9 tabelas adicionais não presentes em `init.sql`. Será extraída via `pg_dump --schema-only` do banco real, não do repo.

**D6 — Automação por pg_cron (BLOQUEADO)**
`pg_cron` e `pg_net` não estão disponíveis no plano Free. Alternativas:
- **A.** Upgrade para Pro ($25/mês) — habilita pg_cron nativo.
- **B.** GitHub Actions scheduled workflow chamando Edge Function `scheduler` via webhook.
- **C.** Vercel/Railway Cron chamando Edge Function.
- **D.** Worker externo (container) com cron próprio.

Recomendação inicial do agente: **GitHub Actions** para começar (zero custo, já temos o repo no GitHub), migrar para pg_cron se o Senhor aprovar upgrade para Pro.

**Novo achado — Limpeza de backups**
As tabelas `reviews_backup_cp`, `review_collaborators_backup_cp`, `reviews_legacy_archive`, `reviews_raw_legacy_archive` contêm dados que duplicam/triplicam o volume core. Precisam de triagem:
- Mover para schema separado (`archive` ou `legacy`)?
- Exportar para storage (parquet/json) e dropar?
- Aplicar RLS RESTRICTIVE e deixar isolado?

Pergunta relacionada: **o Senhor sabe por que esses backups existem e se ainda têm valor?**

**Novo achado — Funções de ESCRITA exposta a anon**
Este é o achado mais grave. As funções `persist_reviews_atomic`, `update_location_metrics`, `refresh_monthly_view`, `cleanup_legacy_from_dataset`, `reprocess_reviews_for_collaborator` podem ser invocadas por qualquer pessoa com a anon key. **Impacto imediato**: vetor de DoS, manipulação de dados operacionais, poluição de métricas. **Prioridade máxima** na migration `revoke_anon_grants`.
