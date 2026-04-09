# DESIGN-DISCUSSION — Decisões Técnicas (v2)

> Decisões arquiteturais resolvidas e justificadas. Este é o documento que o Senhor revisa antes de qualquer implementação. Alterações aqui disparam revisão das specs dependentes.
>
> **Legenda de status:**
> - ✅ **Resolvido** — decisão tomada, vigente
> - 🔄 **Revisado** — decisão atualizada após pivô 2026-04-09
> - ❓ **Aberto** — ver `OPEN-QUESTIONS.md`
>
> **v2 (2026-04-09):** Pivô arquitetural. Backend passa de Next.js Route Handlers para Python/FastAPI em container Railway. Workers em arq. Supabase reduzido a banco + IdP. Next.js removido. Decisões afetadas: D1, D2, D6, D7, D8, D9, D10, D12, D14. Decisões novas: D16, D17, D18.

---

## D1 — Modelo de Acesso a Dados: Backend FastAPI em Container Railway 🔄

**Status anterior:** Next.js Route Handlers como BFF.
**Status atual:** Python/FastAPI em container Railway.

**Contexto**
O frontend consulta Supabase diretamente do browser com a `anon` key, com fallback para mocks em caso de falha. Expõe o schema público, impossibilita autorização granular e mascara incidentes. O Senhor solicitou backend Python rodando em containers na Railway.

**Decisão**
- **Frontend Vite SPA (container nginx)** nunca fala com Supabase para dados de negócio.
- **Backend FastAPI (container uvicorn)** é o único componente que conhece a `service_role` key e a connection string do Postgres.
- **API pattern:** `/api/v1/<recurso>/<ação>` sob o mesmo domínio Railway, com `credentials: 'include'` no fetch do frontend.
- **Cookie httpOnly Secure SameSite=Lax** emitido pelo backend após login. Frontend não manipula JWT.
- **Camadas do backend:**
  ```
  backend/app/
    api/v1/                 # Route handlers (thin layer)
    core/                   # config, security, errors
    db/                     # SQLAlchemy session, models
    schemas/                # Pydantic request/response
    services/               # business logic
    deps/                   # dependency injection (auth, db, redis)
    workers/client.py       # client para enfileirar tasks no arq
  ```
- **Router → Service → Model** (sem repository layer, SQLAlchemy é a abstração — padrão Minutas-Cartório reutilizado).
- **Type safety end-to-end** via Pydantic v2 + mypy no backend, generated TS types no frontend via `datamodel-code-generator` ou manual (a decidir na Fase 1).

**Consequências**
- `dashboard-frontend/src/lib/adapters/supabase.ts` e similares são **deletados**. Novo client HTTP em `frontend/src/lib/api/`.
- Nenhum arquivo `@supabase/supabase-js` no frontend exceto se for necessário para SSR auth helpers — **provavelmente nenhum**. O frontend só faz HTTP calls ao backend.
- Backend acessa Supabase via `asyncpg` + SQLAlchemy 2 async (pooler URL) para queries, e via `httpx` para falar com a Supabase Management API quando necessário (admin ops).

---

## D2 — Autenticação: Supabase Auth como IdP + Backend como Relay 🔄

**Status anterior:** Supabase Auth direto no browser + httpOnly cookie via Next.js Route Handler.
**Status atual:** Supabase Auth acessado exclusivamente pelo backend via gotrue API; frontend só vê cookies httpOnly emitidos pelo backend.

**Contexto**
Sem Next.js, não há mais Middleware ou Route Handler para gerenciar cookies. O backend FastAPI assume esse papel. Queremos manter o Supabase Auth porque ele já oferece hashing, reset, invite, MFA.

**Decisão**
- **Provider:** Supabase Auth (gotrue). Razões: hashing bcrypt pronto, reset por e-mail, invite links, MFA TOTP, recovery tokens.
- **Cliente:** backend usa `gotrue-py` ou chamadas `httpx` diretas para `https://<ref>.supabase.co/auth/v1/*` com a `service_role` key.
- **Fluxo de login:**
  1. Frontend `POST /api/v1/auth/login` com `{email, password}`.
  2. Backend chama `POST /auth/v1/token?grant_type=password` na Supabase.
  3. Supabase retorna `{access_token, refresh_token, user}`.
  4. Backend seta dois cookies httpOnly: `sb_access` (TTL 1h) e `sb_refresh` (TTL 7d).
  5. Backend retorna perfil do usuário ao frontend.
- **Middleware de sessão** (FastAPI dependency):
  1. Lê `sb_access` cookie.
  2. Valida JWT localmente via JWKS pública do Supabase (cacheada com TTL 10min).
  3. Se expirado, tenta refresh automático com `sb_refresh`; se ok, rotaciona ambos os cookies e deixa a request seguir.
  4. Popula `request.state.user` com `{id, email, role, metadata}`.
  5. Se nada funciona, retorna 401.
- **Roles:** `admin` | `manager` | `viewer` armazenados em `user_profiles.role` (tabela nossa, FK para `auth.users.id`). Replicados no `app_metadata` do usuário para estar no JWT.
- **Onboarding:** invite-only. Admin cria usuário via `/api/v1/admin/users POST`, backend usa `POST /auth/v1/invite` do gotrue. Novo usuário recebe link com token, define senha, vira ativo.
- **Reset:** `POST /api/v1/auth/forgot` → backend chama `POST /auth/v1/recover`. Token de uso único expira em 15 min.
- **MFA:** TOTP. Ativável pelo próprio usuário em `/settings/security`. Fluxo via `POST /auth/v1/factors`.
- **Rate limit:** Redis. 5 tentativas de login por 15 min por `(email, ip)`. Lockout temporário escalado (15min → 1h → 24h).
- **Refresh rotation:** gotrue faz rotação automática. Backend cuida de grace period em abas múltiplas via cache Redis de 10s do refresh anterior.
- **Senhas:** **nunca** passam pelo backend em log ou storage. São enviadas ao gotrue e descartadas da memória.

**Alternativas descartadas**
- Auth 100% custom (passlib + python-jose): viável, mas desperdiça a infra pronta do Supabase, complica recovery/invite/MFA.
- Supabase Auth no browser + backend validando JWT: reintroduz a chave anon no bundle e abre o flanco que queremos fechar.

---

## D3 — Autorização no Banco: RLS RESTRICTIVE + default deny ✅ (reforçada)

**Status:** inalterada em essência, reforçada após snapshot real de produção.

**Descobertas do snapshot 2026-04-09**
- RLS habilitada em apenas parte das tabelas, com policies `USING (true)` (permit-all) em `reviews`, `review_collaborators`, `collaborators`, etc.
- Política **explícita** `reviews_raw_insert_cartorio_anon` para o role `{anon}` fazer INSERT em `reviews_raw`.
- **Funções de escrita Postgres com `GRANT EXECUTE TO anon`**: `persist_reviews_atomic`, `update_location_metrics`, `refresh_monthly_view`, `cleanup_legacy_from_dataset`, `reprocess_reviews_for_collaborator`, `enqueue_*`, `claim_nlp_review`, `complete_nlp_review`, `fail_nlp_review`, `process_collaborator_mentions`, `create_auto_alerts`.

**Decisão final**
- **Dropar todas as policies atuais** na Fase 0. Migration `rls_lockdown`.
- `alter table ... enable row level security; alter table ... force row level security;` em todas as tabelas `public`.
- Policy default `using (false)` em todas as tabelas (deny all).
- Nenhuma policy nova liberando acesso por role — o backend usa `service_role`, que bypassa RLS, então RLS serve como defesa em profundidade.
- **Revogar `execute ... from anon, authenticated` em todas as funções custom**, incluindo as críticas de escrita.
- `service_role` mantém acesso integral (não precisa grant explícito).
- Comentário SQL em cada policy/função documentando o escopo.

**Por que manter RLS se o backend usa service_role e bypassa RLS?**
Defesa em profundidade. Se a `service_role` key vazar por descuido (ex.: logado acidentalmente), ou se alguém introduzir código que usa a `anon` key, as policies impedem qualquer leitura/escrita a partir do browser.

---

## D4 — Schema Migrations: Supabase CLI + `supabase/migrations/` ✅

**Status:** ✅ Resolvido. Reforço após descoberta de drift.

**Contexto**
- `supabase/sql/` com 4 arquivos desordenados + `EXECUTE_ESTE_SQL.sql` na raiz.
- **9 tabelas em produção não estão declaradas no `init.sql`** (collection_runs, monitoring_config, review_alerts, review_collaborator_jobs, reviews_backup_cp, review_collaborators_backup_cp, reviews_legacy_archive, reviews_raw_legacy_archive, possivelmente outras).
- Impossível reproduzir o ambiente a partir do repo.

**Decisão**
- **Baseline extraída do estado REAL de produção**, não do `init.sql`. Comando: `supabase db dump --schema public --linked` (requer password do DB — alternativa: query via Management API e reconstruir via templates).
- Migrations em `supabase/migrations/` com timestamps `YYYYMMDDHHMMSS_<snake_case>.sql`.
- `supabase/sql/` e `EXECUTE_ESTE_SQL.sql` deletados no fim da Fase 0.
- CI valida `supabase db diff --linked` retornando vazio.
- Uso do access token fornecido pelo Senhor (`sbp_05e1d9fc8034ef675300b50b1f23ba90c7d8ee40`) — em env var local do CI, nunca commitado.

---

## D5 — Segredos: fora do git, rotação obrigatória ✅ (reforçada)

**Status:** ✅ + **urgência crítica** confirmada via teste em 2026-04-09.

**Teste executado em 2026-04-09**
```
Legacy anon JWT          → HTTP 200 (ATIVA)
Legacy service_role JWT  → HTTP 200 (ATIVA)
New publishable key      → HTTP 200 (ATIVA)
```

As chaves legadas comentadas como "deprecated" no `.env` **continuam válidas em produção**. Estão em texto claro em `.env.docker` (rastreado no git). **Ação imediata na Fase 0**.

**Decisão**
- **Ação #1 da Fase 0:** rotacionar as duas chaves legadas no console Supabase.
- **Ação #2:** remover `.env.docker` do tracking git. Purgar histórico é opcional mas recomendado (exige aprovação explícita do Senhor).
- Convenção permanente: `.env*` ignorado, exceto `.env.example`.
- Segredos por ambiente:
  - **Dev local:** `.env.local` por serviço, nunca commitado.
  - **CI:** GitHub Secrets.
  - **Produção Railway:** Railway env vars por serviço.
  - **Supabase Management API:** access token do Senhor em GitHub Secret `SUPABASE_ACCESS_TOKEN`.
- Pre-commit hook bloqueando commit de `.env*` não-`.example` (script shell simples).
- Auditoria CI: `gitleaks` em todo PR.

---

## D6 — Automação: arq async Redis queue + cron built-in (container worker Railway) 🔄

**Status anterior:** `pg_cron` + Edge Functions.
**Status atual:** arq + Redis no container worker Railway.

**Contexto**
Plano Free do Supabase não instala `pg_cron` nem `pg_net`. Pivô para Python/Railway resolve elegantemente: temos um container worker dedicado, com acesso a Redis, e Python tem ótimas libs para task queue.

**Decisão**
- **Biblioteca:** **arq** (https://arq-docs.helpmanual.io/). Razões:
  - Async-first (mesmo event loop do FastAPI).
  - Mesmo criador do Pydantic (Samuel Colvin) → consistência de design.
  - Cron scheduling built-in (não precisa APScheduler separado).
  - Retry exponencial, dead-letter queue, concurrency control nativos.
  - Leve (~1k LOC), foco único, manutenção ativa.
  - Usa Redis (que já teremos para rate limit).
- **Broker:** Redis (addon Railway).
- **Estrutura do worker:**
  ```
  workers/app/
    tasks/
      scraping.py         # collect_reviews, backfill_location
      nlp.py              # classify_review, extract_mentions
      collaborators.py    # reprocess_collaborator, merge_aliases
      maintenance.py      # refresh_monthly_view, archive_old_reviews
    cron.py               # arq cron definitions
    settings.py           # arq WorkerSettings
    main.py               # arq entry point
  ```
- **Cron jobs planejados (Fase 4):**
  ```python
  cron_jobs = [
      cron(collect_reviews, hour={0,1,2,3,4,5,...,23}, minute=5),  # hora em hora
      cron(refresh_monthly_view, hour={3}, minute=0),              # diária 03h
      cron(check_collection_health, minute={0,15,30,45}),          # 15 em 15 min
      cron(daily_digest_email, hour={9}, minute=0),                # 09h diário
  ]
  ```
- **Observabilidade:** cada task grava `job_runs` no Postgres com `(id, task_name, started_at, finished_at, status, error, correlation_id, result)`.
- **Idempotência:** chave única determinística por task (ex.: `collect_reviews:<location_id>:<date>`) para deduplicar.
- **Concurrency:** configurável por task (`max_jobs=10` no settings).
- **Retry:** backoff exponencial, max 3 tentativas, DLQ via Redis.
- **Health:** worker expõe `/health` via HTTP separado (porta 9000) para Railway healthcheck.

**Alternativas descartadas**
- **Celery:** pesado, mais complexo, orientado a thread, sync-first com adaptador async.
- **Dramatiq:** excelente, mas sync-first. Para fluxo 100% async, arq é superior.
- **rq:** simples demais, sem cron, sem DLQ nativo.
- **APScheduler standalone:** só scheduler, não task queue. Serve como complemento, não como substituto.
- **pg_cron:** indisponível no Free.

---

## D7 — Scraper: Reconstrução em Python 🔄

**Status anterior:** aberto (eliminar scraper custom?).
**Status atual:** reconstruir do zero em Python na Fase 4, conforme pedido explícito do Senhor.

**Decisão**
- `scraper/` atual (Node + Playwright) é **deletado na Fase −1**.
- Reconstrução ocorre na Fase 4, totalmente em Python.
- **Arquitetura do novo scraper:**
  - Tasks arq no worker container.
  - **Fonte primária:** DataForSEO API (HTTP, `httpx.AsyncClient`). Simples, estável, paga por uso. Já temos Edge Function funcionando com ela.
  - **Fallback/complemento:** `playwright-python` async, rodando no mesmo container worker ou em container `scraper` separado (decisão na Fase 4 baseada em custo e necessidade).
  - Rate limit respeitoso (Redis sliding window).
  - Retries com backoff.
  - Idempotência via `review_id` upsert.
- **Edge Function `dataforseo-reviews` atual:** mantida até Fase 4, depois aposentada.
- **Edge Function `auto-collector` e `scheduler` atuais:** aposentadas na Fase 4 — suas responsabilidades migram para tasks arq.

---

## D8 — Frontend: Vite + React + TypeScript + Tailwind v4 🔄

**Status anterior:** Next.js 15 App Router RSC-first.
**Status atual:** Vite SPA.

**Contexto**
Senhor solicitou migração para Vite + React no frontend.

**Decisão**
- **Stack:**
  - Vite 6
  - React 19
  - TypeScript 5
  - TailwindCSS 4 (mantido)
  - shadcn/ui (mantido, já temos componentes)
  - TanStack Query v5 (mantido)
  - TanStack Table (mantido)
  - React Router 7 (novo — substitui App Router)
  - Zustand (mantido)
  - Zod (mantido)
  - Sonner (mantido)
  - React Hook Form (adicionar)
  - Axios ou fetch nativo (a decidir — fetch provavelmente suficiente)
  - Recharts (mantido)
  - date-fns (mantido)
- **Estrutura:**
  ```
  frontend/src/
    pages/               # top-level routes
    components/          # shared (kept from dashboard-frontend)
      ui/                # shadcn primitives
      shell/             # layout
      kpi/               # cards
      charts/
      table/
    lib/
      api/               # HTTP client + endpoints
      auth/              # cookie-based session helpers
      query/             # TanStack Query setup
    hooks/
    store/               # Zustand stores
    routes.tsx           # React Router config
    main.tsx
    App.tsx
  ```
- **Build output:** `dist/` servido por nginx:alpine em container Railway.
- **Env vars:** apenas `VITE_API_BASE_URL` (URL do backend) — tudo mais é server-side.
- **Auth flow:** `axios.create({ baseURL, withCredentials: true })`. React Router loader/guard redireciona para `/login` se `/api/v1/auth/me` retorna 401.
- **Porting:** componentes reutilizáveis de `dashboard-frontend/src/components/ui/*` migram direto; páginas reescritas para consumir `/api/*` em vez de Supabase client.
- **Sem SSR:** dashboard é interno autenticado, não precisa SEO. SPA simplifica deploy.

**Alternativas descartadas**
- Manter Next.js (o Senhor foi explícito).
- Remix: alta qualidade, mas Senhor escolheu Vite.
- Astro: híbrido, não se adapta bem a dashboard reativo.

---

## D9 — Observabilidade: Sentry + structlog + Railway Logs 🔄

**Status atual:** adequada ao stack Python/Railway.

**Decisão**
- **Sentry Python SDK** no backend (`sentry-sdk[fastapi]`) e workers (`sentry-sdk`).
- **Sentry JS SDK** no frontend (`@sentry/react`). Source maps upload no build CI.
- **structlog** no backend com JSON output em stdout. Formato: `{timestamp, level, logger, event, correlation_id, user_id, ...extra}`.
- **Railway Logs** captura stdout/stderr automaticamente. Retention nativa.
- **Correlation ID** (`X-Request-ID`) gerado no frontend (UUID), propagado via header HTTP, impresso em cada log line do backend e workers, e em cada evento Sentry.
- **Healthchecks:**
  - Backend: `GET /health` (200 se OK), `GET /health/detailed` (autenticado, mostra DB + Redis + version).
  - Workers: HTTP server auxiliar na porta 9000 com `/health`.
  - Frontend: `GET /` do nginx.
- **Métricas:** `/metrics` com `prometheus_fastapi_instrumentator` no backend (opcional, ativado por env var). Futuro: addon Prometheus/Grafana na Railway.

**Plano gratuito:** Sentry Developer (5k erros/mês) suficiente para começar. Upgrade para Team ($26/mês) apenas se necessário.

---

## D10 — Testes 🔄

**Status atual:** adequado ao stack Python/Railway.

**Decisão**
- **Backend:**
  - **pytest** + **pytest-asyncio** + **httpx.AsyncClient** (TestClient FastAPI).
  - DB de teste via **testcontainers** (Postgres efêmero) OU projeto Supabase de staging dedicado.
  - **factory-boy** ou simples fixtures para dados de teste.
  - Coverage via **pytest-cov**.
  - Cobertura mínima: 70% nas camadas auth, services, db.
- **Workers:**
  - pytest com **fakeredis** para não precisar Redis real.
  - Testa tasks individualmente (function-level) + E2E via arq test helper.
- **Frontend:**
  - **Vitest** + **@testing-library/react** + **happy-dom** + **MSW** (mock service worker).
  - Unit para componentes puros, integration para hooks + stores.
- **E2E:**
  - **Playwright** (mantido, já instalado).
  - Stack: sobe backend + workers + redis + frontend local, aponta para Supabase staging.
  - Cobre: login, auth guard, CRUD colaborador, visualização dashboard, fluxo de erro de API.
- **CI (GitHub Actions):**
  - Job `backend-test`: Python 3.12, pytest, coverage.
  - Job `frontend-test`: Node 22, vitest, build.
  - Job `workers-test`: Python 3.12, pytest.
  - Job `e2e`: só em push para `main` + manualmente (mais lento).
  - Job `lint`: ruff (backend), eslint (frontend), mypy (backend), tsc (frontend).

---

## D11 — Multi-tenant: schema preservado, UX single-tenant ✅

**Inalterada.** `location_id` canônico = **`cartorio-paulista-location`** (decisão 2026-04-09 baseada no snapshot: é o valor usado pela coleta scheduled). Vem de env var `DEFAULT_LOCATION_ID` no backend.

Migration `consolidate_location_id` na Fase 0 reassocia os 4.421 reviews que estão em `cartorio_paulista_main` para `cartorio-paulista-location`.

---

## D12 — Estrutura de Repositório Alvo 🔄

```
Dashboard Google - Cartório Paulista/
  .planning/                    # SDD docs (versionado)
    enterprise-rebuild/
      CONSTITUTION.md
      OVERVIEW.md
      DESIGN-DISCUSSION.md
      OPEN-QUESTIONS.md
      README.md
      research/
      legacy-snapshot/          # arquivo histórico (Next.js etc)
      phase-minus-1-cleanup/
      phase-0-security-baseline/
        SPEC.md
        TASKS.md
        snapshot/
      phase-1-auth-bff/
      ...

  frontend/                     # Vite + React (Fase −1 cria)
    src/
      pages/
      components/
      lib/
      hooks/
      store/
      routes.tsx
      main.tsx
      App.tsx
    public/
    nginx.conf
    Dockerfile
    vite.config.ts
    tsconfig.json
    package.json
    .env.example

  backend/                      # FastAPI (Fase −1 cria)
    app/
      api/v1/
      core/
      db/
      schemas/
      services/
      deps/
      main.py
    tests/
    alembic/                    # ou usar supabase/migrations diretamente?
    Dockerfile
    pyproject.toml
    .env.example

  workers/                      # arq (Fase −1 cria)
    app/
      tasks/
      cron.py
      settings.py
      main.py
    tests/
    Dockerfile
    pyproject.toml
    .env.example

  supabase/                     # apenas DB
    migrations/                 # SQL versionado (Fase 0 popula)
    config.toml                 # apenas config de migration, nada de functions

  docs/
    architecture.md
    runbooks/
    lgpd/

  .github/workflows/
    ci.yml
    phase-0-gate.yml

  docker-compose.dev.yml        # redis + backend + workers + frontend local
  railway.json                  # Railway service definitions
  .env.example
  .gitignore
  .githooks/pre-commit
  CLAUDE.md                     # atualizado
  README.md                     # atualizado
```

**Removidos na Fase −1:**
- `dashboard-frontend/` → arquivado em `.planning/enterprise-rebuild/legacy-snapshot/dashboard-frontend.tar.gz`
- `scraper/` → arquivado
- `google-maps-scraper-tool/` → já deletado (2026-04-09)
- `railway-collector/` → já deletado (2026-04-09)
- `supabase/functions/` → arquivado (Edge Functions são aposentadas na Fase 4)
- `supabase/sql/` → portado para `supabase/migrations/` na Fase 0
- `EXECUTE_ESTE_SQL.sql` → portado + deletado
- `docker-compose.yml` → substituído por `docker-compose.dev.yml`
- `dataset_Google-Maps-Reviews-Scraper_*.json` → arquivado em `.tmp/` (gitignored)
- `nul`, `node_modules/` (raiz) → deletados
- `RELATORIO_*.md`, `IMPLEMENTACAO_COMPLETA.md`, `DOCUMENTACAO_FUNCIONALIDADES_FLUXOS.md` → movidos para `.planning/enterprise-rebuild/legacy-docs-archive/`
- `.auto-claude/worktrees/*` → avaliado por valor, provavelmente deletado
- `scripts/` e `execution/` → **triagem**: códigos reutilizáveis migram para `backend/app/scripts/` ou `workers/app/tasks/`, resto é arquivado.
- `directives/` → atualizados para refletir nova arquitetura na Fase 5 ou arquivados se forem obsoletos.
- `archive/` → avaliado no momento da limpeza.

---

## D13 — LGPD Compliance Leve ✅

**Inalterada.**
- Retenção 24 meses; anonimização de `reviewer_name` além disso.
- Endpoint `/api/v1/admin/lgpd/export` e `/api/v1/admin/lgpd/forget`.
- Tabela `audit_log` append-only.
- DPA implícito nos termos de uso do Cartório.

---

## D14 — Deploy: Railway 🔄

**Status anterior:** Vercel ou Railway.
**Status atual:** Railway confirmado.

**Decisão**
- **Serviços Railway:**
  1. `frontend` — Dockerfile Vite builder + nginx:alpine.
  2. `backend` — Dockerfile Python 3.12-slim + uvicorn (gunicorn --worker-class uvicorn.workers.UvicornWorker em prod).
  3. `workers` — mesmo base do backend, CMD `arq workers.app.main.WorkerSettings`.
  4. `redis` — Railway Redis addon.
- **Supabase:** externo, plano Free, apenas DB + Auth.
- **Ambientes:** `dev` (local docker compose) → `staging` (Railway env separada + Supabase staging) → `prod` (Railway env separada + Supabase atual).
- **Deploy:** Git push → Railway auto-deploy via integração GitHub. PR → staging; merge em `main` → staging + tag release; tag release → prod manual.
- **Rollback:** Railway oferece redeploy de revisão anterior em um clique. Migrations exigem attention — cada migration em `supabase/migrations/` precisa considerar reversibilidade quando possível.
- **Config:**
  - `railway.json` no root declarando os serviços.
  - Secrets por serviço via Railway dashboard.
  - Networking interno: backend e workers se falam via hostname Railway privado.
  - Exposição: apenas frontend e backend têm porta pública (443); workers e redis são internos.

**Supabase staging:**
- Criar novo projeto Supabase Free para staging (`bugpetfkyoraidyxmzxu-staging` ou nome novo).
- Migrations aplicadas primeiro em staging, depois em prod.
- Dados sintéticos ou dump anonimizado de prod.

---

## D15 — Estratégia de Portabilidade de Dados Atuais ✅

**Inalterada** exceto pela nova urgência das chaves legadas.

- `pg_dump` lógico de produção **antes** de qualquer migration destrutiva.
- Migrations aplicadas **primeiro em staging** para validar.
- **Nenhuma ação destrutiva** em prod sem backup verificado.
- Zero downtime: as migrations de RLS lockdown são invisíveis do ponto de vista do frontend atual (que já falha silenciosamente com mocks — e está em "modo manutenção" durante a Fase 0).

---

## D16 — Backups históricos: schema `archive` com RLS restritiva 🆕

**Contexto (descoberto no snapshot 2026-04-09)**
- `reviews_backup_cp` (16.360 linhas) — backup triplicado
- `review_collaborators_backup_cp` (1.405 linhas)
- `reviews_legacy_archive` (5.877 linhas)
- `reviews_raw_legacy_archive` (volume desconhecido)

Todas sem RLS. Nenhuma referência no código atual. Origem obscura — provavelmente intervenções manuais em 2025.

**Decisão**
- **Não dropar agora.** Reversibilidade > limpeza imediata.
- Migration `archive_legacy_tables` na Fase 0:
  1. Cria schema `archive`.
  2. `alter table public.<t> set schema archive;` para cada uma das 4 tabelas.
  3. `alter table archive.<t> enable row level security;`
  4. `create policy "<t>_deny_all" on archive.<t> using (false);`
  5. `revoke all on archive.<t> from anon, authenticated;`
- Ficam no banco mas são invisíveis ao browser e ao `authenticated` role. Backend com `service_role` pode acessar se precisar.
- **Triagem futura:** após 90 dias sem necessidade, migration posterior pode `drop` as tabelas.
- **Export antes do archive:** `pg_dump` dos 4 como snapshot imutável para `snapshot/legacy-backups-2026-04-09.sql.gz`.

---

## D17 — `location_id` canônico e consolidação 🆕

**Contexto (descoberto no snapshot 2026-04-09)**
- `cartorio_paulista_main`: 4.421 reviews (82%). Usado nas 4 execuções `manual` iniciais (29-30/08/2025).
- `cartorio-paulista-location`: 951 reviews (18%). Usado em todas as 12 execuções `scheduled` até 25/09/2025.
- Frontend legacy hardcoda `'cartorio-paulista-location'`.

**Decisão**
- **Canônico = `cartorio-paulista-location`** (seguindo o que a coleta automática usava, que é o fluxo que a reestruturação vai recuperar).
- Migration `consolidate_location_id` na Fase 0:
  ```sql
  update public.reviews
     set location_id = 'cartorio-paulista-location'
   where location_id = 'cartorio_paulista_main';

  update public.reviews_raw
     set location_id = 'cartorio-paulista-location'
   where location_id = 'cartorio_paulista_main';

  update public.gbp_locations
     set ... -- garantir existência do registro canônico
   where location_id = 'cartorio-paulista-location';

  delete from public.gbp_locations where location_id = 'cartorio_paulista_main';
  ```
- Migração só em staging primeiro.
- No código novo, `location_id` vem de `env.DEFAULT_LOCATION_ID` (default `cartorio-paulista-location`).

---

## D18 — Colaboradores inativos permanecem visíveis no histórico 🆕

**Contexto**
17 colaboradores em prod; 4 inativos (João Lourenço, Kaio Gomes, Bianca Alves, Lucas Zupello). Esses 4 acumulam 503 menções históricas.

**Decisão**
- Colaboradores inativos **não são deletados**.
- Permanecem em todas as queries de histórico (menções em reviews antigos).
- UI admin default mostra **apenas ativos**, com toggle "incluir inativos" (default off).
- UI de dashboard de menções mostra todos os que têm dados no período, ativos ou não — toggle para ocultar inativos (default off, porque os históricos deles importam).
- Para "ocultar" permanentemente um colaborador sem perder o dado, admin pode soft-delete (`deleted_at`), que remove do histórico também. Decisão separada do `is_active`.

---

## Resumo das Pendências (atualizado)

**Todas as 10 perguntas originais do `OPEN-QUESTIONS.md` foram resolvidas** nesta sessão (2026-04-09). Ver `OPEN-QUESTIONS.md` para detalhes.

Pendências operacionais que surgirão naturalmente nas fases:
- Budget de Sentry Team ($26/mês) — só se o Senhor quiser integração com Slack, retention estendida.
- Domínio customizado — definir antes do Fase 3 go-live, para Supabase Auth URLs.
- Supabase Pro ($25/mês) — reavaliar após Fase 4 se throughput de Edge Functions ou backup PITR se tornarem relevantes. A princípio, desnecessário.
