# CURRENT STATE AUDIT — 2026-04-09

> Estado real do sistema na data da auditoria. Tudo aqui é factual; opiniões e decisões vivem em `DESIGN-DISCUSSION.md`. Este é o ponto de referência para medir o progresso da reestruturação.

---

## 1. Frontend (`dashboard-frontend/`)

### Estrutura
- Next.js 15.5.9 + React 19 + App Router + Turbopack
- Tailwind CSS v4 + shadcn/ui + Radix
- TanStack Query + Zustand (store)
- Rotas em `src/app/`:
  - `page.tsx` (home / dashboard principal)
  - `analytics/`
  - `api/health/` (único route handler existente)
  - `collaborators/`
  - `reports/`
  - `reviews/`
  - `settings/`
  - `trends/`
- Componentes em `src/components/`: `charts/`, `command/`, `kpi/`, `settings/`, `shell/`, `skeletons/`, `table/`, `ui/`
- Lib: `src/lib/adapters/`, `src/lib/dtos/`, `src/lib/hooks/`

### Pontos críticos
1. **Zero autenticação.** Todas as páginas são `"use client"`, sem middleware, sem `supabase.auth`, sem guard. Qualquer pessoa com a URL tem acesso total.
2. **Acesso direto ao Supabase do browser.** `src/lib/adapters/supabase.ts` cria `createClient(envUrl, envAnon)` e expõe ~14 `fetch*` functions que consultam o banco direto do cliente.
3. **localStorage credential override** (`supabase.ts:21-33`): aceita sobrescrever `SUPABASE_URL`/`SUPABASE_ANON_KEY` via `window.localStorage`. Vetor MITM trivial.
4. **Mock fallback mascara falhas.** Cada `fetch*` tem `try → RPC → query direta → return mockData`. Falha em qualquer camada é silenciosa: o usuário vê dados zerados/falsos sem aviso.
5. **Tipagem colapsada.** ~18 usos de `any`:
   - `src/app/page.tsx:24-30` (5×)
   - `src/lib/adapters/supabase.ts` (7×)
   - `src/lib/hooks/use-monthly-navigation.ts:12-13` (2×)
   - `src/components/table/data-table.tsx:60`
6. **Duas interfaces `Review` divergentes:** `src/lib/adapters/supabase.ts:47-55` vs. `src/lib/supabase.ts:4-15`.
7. **N+1 em `fetchCollaboratorMentionsByMonth`** (`src/lib/adapters/supabase.ts:241-389`): loop de 1000 reviews + consulta por colaborador para cada.
8. **118 `console.log`** espalhados em `src/`, sem níveis, sem filtro de produção.
9. **`package.json:7`** tem `"build": "next build --no-lint"` — lint desativado no build.
10. **`location_id = 'cartorio-paulista-location'` hardcoded** em vários pontos do adapter.
11. **Tests Playwright mínimos:** um único arquivo (`tests/e2e/dashboard.spec.ts`, ~46 linhas), cobre apenas cenário de agosto/2025.
12. **Erros engolidos:** catch blocks em `src/app/page.tsx:42-71` só fazem `console.error`, sem toast, sem setState, sem error boundary.
13. **Três lockfiles no caminho** — `package-lock.json` em três níveis, gerando warning do Turbopack.

### Pontos positivos
- Componentes shadcn/ui bem organizados.
- Design system consistente.
- Estrutura de pastas limpa.
- TanStack Query configurado (staleTime 60s, refetchOnWindowFocus false).
- Uso de Server Components é potencialmente viável — infra do Next.js 15 está presente.

---

## 2. Backend / Scripts / Execution

### `scripts/` (Node orchestration)
- `upsert-google-reviews.js`: ingere CSV → reviews. Cloud-ready.
- `link-collaborator-mentions.js`: roda NLP para associar colaboradores. Cloud-ready.
- `fix-reviews-pk.js`: hot-fix histórico.
- `invoke-auto-collector.js`: dispara Edge Function auto-collector.
- `import-google-reviews.js`: ingestão genérica.

### `execution/` (Python deterministic)
- `review_alias_imputer.py`: usa LLM (OpenRouter) para imputar aliases em reviews.
- `text_alias_matcher.py`: **untracked no git** — script de regex determinístico referenciado em `directives/review_alias_sop.md:3-47`.
- `upsert_collaborator_aliases.py`: upsert de aliases via REST API.
- Outros utilitários de CSV/JSON.

### `directives/` (SOPs markdown)
- `upsert_reviews.md`: pipeline de ingestão. Reality matches.
- `review_alias_sop.md`: imputação + matching. Parcialmente drift (referência a script untracked).
- Outros SOPs presentes, em geral alinhados com os scripts.

---

## 3. Supabase

### `supabase/sql/` (legado, sem versionamento)
- `init.sql` (475 linhas aprox.): schema inicial + seed + RPCs.
- `fix_reviews_pk.sql`: hot-fix da PK de `reviews`.
- `review_collaborator_sync.sql`: sync de colaboradores.
- `2025-09-17_apify_standardization.sql`: padronização de estrutura apify.

### `EXECUTE_ESTE_SQL.sql` (raiz do repo)
Hot-fix manual de PRIMARY KEY de `reviews`. Sinal claro de schema drift e processo de migração inexistente.

### `supabase/migrations/`
**Não existe.** Sistema de migrations formal ausente.

### Edge Functions (`supabase/functions/`)
12 funções detectadas:
- `_shared/` — utils comuns
- `auto-collector/` — coleta via Apify/DataForSEO → `reviews` + `reviews_raw`
- `scheduler/` — orquestra `auto-collector` + `review-collaborator-jobs`
- `classifier/` — NLP/classificação
- `collaborators/` — CRUD
- `dataforseo-lookup/` — busca de place
- `dataforseo-reviews/` — coleta de reviews via API DataForSEO
- `gbp-backfill/` — backfill histórico Google Business Profile
- `gbp-webhook/` — webhook handler GBP
- `review-collaborator-jobs/` — associa menções a colaboradores
- `alerts/` — notificações (destino desconhecido)
- `apply-migration/` — **apply DB migration via function** (red flag: migração via runtime)

Status de deploy não documentado no repo. Nenhum arquivo de `.env` das functions versionado (correto).

### Schema de dados (do `init.sql`)
Tabelas:
- `gbp_accounts` (PK `account_id`)
- `gbp_locations` (PK `location_id`, FK `account_id`)
- `reviews_raw` (PK `review_id`, FK `location_id`)
- `reviews` (PK `review_id`, FK `location_id`, colunas: rating, comment, reviewer_name, is_anonymous, create_time, update_time, reply_text, reply_time, tsv)
- `services` (PK `id`, `name unique`, `synonyms[]`)
- `collaborators` (PK `id`, `full_name`, `department`, `position`, `is_active`, `aliases[]`)
- `review_services` (PK composta review_id + service_id, confidence)
- `review_collaborators` (PK composta review_id + collaborator_id, match_score, mention_snippet)
- `review_labels` (PK `review_id`, sentiment enum, toxicity, is_enotariado, classifier_version)
- `nlp_queue` (PK `id`, FK `review_id`, status, attempts)

Materialized view:
- `mv_monthly` — agregações mensais (total reviews, avg_rating, reviews_enotariado, avg_rating_enotariado)

RPCs (todas `security definer`, `set search_path = public`):
- `get_reviews_stats()` — **grant execute to anon, authenticated** ← EXPOSTA PUBLICAMENTE
- `get_recent_reviews(limit_param int)` — **grant execute to anon, authenticated** ← EXPOSTA PUBLICAMENTE
- `get_monthly_trends()` — (presumido grant similar)
- `get_collaborators_stats()`
- `enqueue_nlp_review`, `claim_nlp_review`, `complete_nlp_review`, `fail_nlp_review` — fila NLP

### Row Level Security — estado real
- **Habilitada apenas em `collaborators`** (`init.sql:121`).
- Policies em `collaborators`:
  - `"Allow read access to collaborators"` — SELECT para `auth.role() = 'authenticated'` (PERMISSIVE)
  - `"Allow write access to collaborators"` — ALL para `service_role OR authenticated` (PERMISSIVE)
- **Todas as demais tabelas (`reviews`, `reviews_raw`, `review_services`, `review_collaborators`, `review_labels`, `gbp_accounts`, `gbp_locations`, `nlp_queue`) NÃO têm RLS habilitada.**
- **Dados não autenticados:** via RPC `get_reviews_stats()` e `get_recent_reviews()` com `grant ... to anon`, **qualquer pessoa com a anon key tem acesso completo aos reviews e métricas**. A anon key está no bundle JS público do frontend.

---

## 4. Scrapers / Coletores

### `scraper/` (ativo)
- Node.js + Playwright + Chromium Alpine.
- `Dockerfile` enxuto.
- Estrutura: `gbp/`, `processors/`, `storage/`, `scheduler/`, `monitoring/`.
- Arquivo `.env` próprio com `SUPABASE_URL` + **JWT legado** `eyJ...9584M85...` em texto claro.
- Health check e scheduler internos.
- Status de deploy: desconhecido (não documentado no repo).

### `google-maps-scraper-tool/` (órfão)
- ~16 diretórios (`cmd/`, `postgres/`, `gmaps/`, etc.).
- Nenhum link ativo a partir do docker-compose ou scripts principais.
- Bloat estimado em ~MBs.

### `railway-collector/` (órfão)
- Estrutura mínima: `.env`, `logs/`, `node_modules/`.
- Referenciado apenas em `.auto-claude/worktrees/tasks/001-*`.
- Candidato a deleção.

---

## 5. Segurança / Segredos

### Arquivos commitados relevantes
- `.env.docker` (**tracked**): contém `SUPABASE_SERVICE_ROLE_KEY` com JWT legado em texto claro. **Breach crítico.**
- `.env.example` (tracked): placeholders, OK.

### Arquivos não commitados mas presentes
- `.env` (raiz): novas chaves `sb_publishable_*` / `sb_secret_*`.
- `dashboard-frontend/.env.local`: criado na sessão atual, usa chaves novas.
- `scraper/.env`: chaves legadas (**ainda em uso**).
- `.auto-claude/worktrees/.../001-*/.env`: chaves novas em claro.

### Chaves ativas identificadas
- Nova publishable (anon): `sb_publishable_REDACTED_IN_GIT_HISTORY`
- Nova secret (service_role): `sb_secret_REDACTED_IN_GIT_HISTORY`
- Legadas (status desconhecido, presumidas ativas):
  - anon JWT `eyJ...9qYGEj...`
  - service_role JWT `eyJ...9584M85...`

### Project ID
`bugpetfkyoraidyxmzxu` (`https://bugpetfkyoraidyxmzxu.supabase.co`)

---

## 6. Documentação interna vs. realidade

- `RELATORIO_ANALISE_CRITICA_DASHBOARD.md`: contém afirmações de "✅ Funcional" que contradizem o estado observado.
- `IMPLEMENTACAO_COMPLETA.md`: marca o sistema como "pronto", inconsistente com auditoria.
- `DOCUMENTACAO_FUNCIONALIDADES_FLUXOS.md`: documentação de fluxos provavelmente desatualizada.
- `CLAUDE.md` (raiz): descreve a 3-layer architecture (Directive → Orchestration → Execution). Ainda vigente como filosofia, mas a parte Directive precisa ser atualizada com a reestruturação.

---

## 7. Testes

- `dashboard-frontend/tests/e2e/dashboard.spec.ts`: um único cenário Playwright.
- Nenhum teste de unit, nenhum teste de integração.
- Edge functions sem testes.
- Scripts Python sem testes (exceto o `review_alias_imputer` que tem alguma validação inline).

---

## 8. Ambiente de desenvolvimento atual (2026-04-09)

- Dev server Next.js rodando em `http://localhost:3000` (background task `bf6rsokge`).
- `.env.local` criado em `dashboard-frontend/` com chaves novas do Supabase cloud.
- Database: Supabase cloud (`bugpetfkyoraidyxmzxu.supabase.co`). Nenhum Postgres local.
- DNS do Supabase **bloqueado no sandbox do shell do agente**, mas resolve normalmente no sistema operacional — não impede o navegador nem o Next server de se conectarem.

---

## Conclusão operacional

O sistema está funcional em aparência, mas **arquiteturalmente inseguro** e **operacionalmente cego**. A aparência de funcionalidade é sustentada por:
1. Dados mockados como fallback silencioso.
2. RLS desabilitada na maioria das tabelas — dados "funcionam" porque ninguém está checando.
3. Zero autenticação — tudo é público por default.

Reconstrução é a recomendação correta. A Fase 0 desta reestruturação foca em **parar o sangramento** antes de construir qualquer coisa nova.
