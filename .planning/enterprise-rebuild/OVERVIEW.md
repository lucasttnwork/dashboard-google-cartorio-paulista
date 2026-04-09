# OVERVIEW — Enterprise Rebuild Roadmap (v2)

> Visão estratégica da reestruturação do Dashboard Cartório Paulista. Detalhe de cada fase vive em `phase-N-*/SPEC.md`. Specs são escritas **uma por vez**, imediatamente antes da execução, para que cada fase aprenda com a anterior.
>
> **v2 (2026-04-09):** atualizado após pivô arquitetural para stack Python/FastAPI/Railway, remoção do Next.js, adição da Fase −1 de limpeza, e verificação em produção que confirmou chaves legadas ativas e sistema de coleta parado há ~6 meses.

---

## Estado Atual (resumo executivo)

Um protótipo frontend Next.js 15 servindo dados mockados como fallback silencioso, consultando Supabase cloud diretamente do browser com a chave `anon`, sem autenticação, com RLS parcial e policies permissivas (`USING (true)`), com **funções de escrita Postgres expostas publicamente** (`persist_reviews_atomic`, `update_location_metrics`, `refresh_monthly_view`, etc.), três scrapers coexistindo no working tree (dois órfãos já deletados em 2026-04-09), schema divergente em **9 tabelas** não versionadas (incluindo ~23.000 linhas em tabelas de backup sem RLS), segredos legados JWT `eyJ...9qYGEj...` / `eyJ...9584M85...` **ativos em produção** e em texto claro no `.env.docker` commitado, coleta automática **parada desde 2025-09-25**, e Edge Functions da v3/v4 sem manutenção desde dezembro de 2025.

Ver `research/CURRENT-STATE-AUDIT.md` e `phase-0-security-baseline/snapshot/prod-state-2026-04-09.md` para o relato crítico completo.

---

## Estado Alvo (one-sentence vision)

Um dashboard seguro, autenticado e auditado, alimentado por um pipeline automatizado de coleta de reviews do Google Business Profile, com painéis operacionais para consulta de dados e painel administrativo para gestão de colaboradores, rodando inteiramente em containers Railway organizados (frontend nginx + backend FastAPI + workers arq + redis), usando Supabase cloud apenas como banco de dados Postgres + provedor de identidade.

---

## Arquitetura-Alvo

```
┌──────────────────────── Railway Project: cartorio-dashboard ──────────────────────┐
│                                                                                    │
│  ┌────────────────────┐          ┌──────────────────────────────────────┐        │
│  │  frontend          │          │  backend (FastAPI + uvicorn)          │        │
│  │  Vite + React 19   │          │                                        │        │
│  │  TS + Tailwind v4  │─────────>│  • /api/auth/*        login/logout    │        │
│  │  shadcn/ui         │  cookie  │  • /api/reviews/*     list/filter     │        │
│  │  TanStack Query    │  httpOnly│  • /api/collaborators/* CRUD admin    │        │
│  │  React Router 7    │          │  • /api/metrics/*     KPIs            │        │
│  │                    │          │  • /api/admin/*       admin-only       │        │
│  │  nginx:alpine      │          │                                        │        │
│  │  Porta 80          │          │  service_role vive APENAS aqui        │        │
│  └────────────────────┘          │  Porta 8000                            │        │
│                                  └────────┬───────────────────────────────┘        │
│                                           │                                        │
│                                           │ invoca via HTTP/arq                    │
│                                           ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐        │
│  │  workers (Python + arq)                                               │        │
│  │                                                                        │        │
│  │  • scraping tasks (Fase 4, reconstruído do zero)                      │        │
│  │  • NLP classifier (sentiment, is_enotariado)                           │        │
│  │  • collaborator mention linker                                         │        │
│  │  • scheduled cron jobs (arq built-in cron)                             │        │
│  │  • data maintenance (mv_monthly refresh, backups)                      │        │
│  │                                                                        │        │
│  │  Concorrência configurável, retry exponencial, DLQ                    │        │
│  └──────────────────────┬─────────────────────────────────────────────────┘        │
│                         │                                                          │
│                         ▼                                                          │
│  ┌────────────────────────────────┐                                               │
│  │  redis (Railway addon)          │                                               │
│  │  • arq queue (tasks + cron)     │                                               │
│  │  • rate limit state (per IP/user)                                              │
│  │  • session cache (TTL curto)                                                   │
│  └────────────────────────────────┘                                               │
└─────────────────────────────────┬─────────────────────────────────────────────────┘
                                  │ asyncpg over TLS (pooler)
                                  ▼
                 ┌──────────────────────────────────────┐
                 │  Supabase Cloud (storage only)       │
                 │  • PostgreSQL 16 + RLS RESTRICTIVE   │
                 │  • Supabase Auth (gotrue) como IdP    │
                 │  • Schema versionado via migrations  │
                 │  • Plano: Free                        │
                 │  • SEM pg_cron, SEM Edge Functions    │
                 │    em papel de runtime de aplicação   │
                 └──────────────────────────────────────┘
```

### Notas arquiteturais

- **Zero código de negócio no Supabase.** Nem Edge Functions, nem pg_cron, nem triggers complexos. Tudo vive em containers Railway controláveis, observáveis e versionados em Python. Supabase é "só o Postgres + Auth".
- **service_role** jamais sai do container do backend / worker. Frontend não conhece a existência dele.
- **Supabase Auth como IdP** (e não custom): backend FastAPI chama a API do gotrue para login/reset/MFA, traduz a resposta em cookie httpOnly. Isso aproveita hashing, recovery flows, invite tokens e MFA TOTP prontos, sem terceirizar a gestão de sessão.
- **Cookie httpOnly** é setado pelo backend sob o domínio Railway (e depois domínio custom). Frontend nunca toca em JWT.
- **arq** como task queue (async Redis queue, mesmo criador do Pydantic) cobre tanto jobs disparados quanto cron agendado, em um só processo, com retry e rate limit nativos.
- **Migrations SQL** versionadas em `supabase/migrations/` aplicadas via Supabase CLI usando o access token fornecido pelo Senhor. CI verifica que o schema em prod == schema declarado.
- **Sem Node.js** fora do frontend. Backend + workers + scraper futuro = Python.

---

## Fases

Sete fases verticais. Cada uma entrega algo testável end-to-end; cada uma tem critério de aceitação objetivo.

### Fase −1 — Cleanup & Architectural Pivot
**Objetivo:** preparar o repositório para a nova stack. Remover o que não será mais usado, criar a estrutura nova vazia mas funcional.

- Arquivar documentação decorativa (`RELATORIO_*.md`, `IMPLEMENTACAO_COMPLETA.md`, `DOCUMENTACAO_FUNCIONALIDADES_FLUXOS.md`).
- Remover datasets commitados na raiz, `nul`, `node_modules/` na raiz, `docker-compose.yml` antigo.
- Arquivar `dashboard-frontend/` Next.js em `.planning/enterprise-rebuild/legacy-snapshot/`.
- Deletar `scraper/` (será reconstruído do zero na Fase 4).
- Triagem de `scripts/` (Node) e `execution/` (Python) — reter apenas o que pode ser reaproveitado pelo backend/workers.
- Criar estrutura nova vazia: `frontend/` (Vite), `backend/` (FastAPI), `workers/` (arq), `supabase/migrations/`, `docs/`, `.github/workflows/`.
- Criar Dockerfiles mínimos funcionando (hello world por container).
- Criar `railway.json` declarando os 4 serviços.
- Criar `docker-compose.dev.yml` para rodar tudo local (redis local, Supabase cloud).
- Atualizar `CLAUDE.md` e `README.md` refletindo a nova arquitetura.
- Atualizar `.gitignore`.

**Critério de aceitação:** `docker compose -f docker-compose.dev.yml up` sobe frontend + backend + workers + redis; cada container responde em um health endpoint; `railway up` simulado dry-run sem erro; `ls` no repo mostra apenas a estrutura nova + `.planning/` + `supabase/` + docs; `CLAUDE.md` reflete realidade.

---

### Fase 0 — Security Baseline
**Objetivo:** parar o sangramento. Segredos rotacionados, RLS realmente restritiva, grants perigosos revogados, backups históricos isolados.

- **Ação #1:** rotacionar chaves legadas JWT (`eyJ...9qYGEj...` e `eyJ...9584M85...`) no console Supabase. Confirmadas ativas em 2026-04-09.
- Remover `.env.docker` do tracking git. Purga opcional do histórico com aprovação explícita.
- Pre-commit hook bloqueando `.env*` não-`.example`.
- Criar `supabase/migrations/` com baseline snapshotado do estado REAL de produção (não do `init.sql`). Inclui as 9 tabelas não versionadas.
- Migration `rls_lockdown`: dropa as policies permissivas atuais; habilita RLS com `USING (false)` default-deny em todas as tabelas `public`; `FORCE ROW LEVEL SECURITY` onde aplicável.
- Migration `revoke_anon_grants`: revoga `execute to anon` de **todas** as funções custom, incluindo as críticas de escrita (`persist_reviews_atomic`, `update_location_metrics`, `refresh_monthly_view`, `cleanup_legacy_from_dataset`, `reprocess_reviews_for_collaborator`, `enqueue_*`, `claim_nlp_review`, `complete_nlp_review`, `fail_nlp_review`). Documenta escopo em comentário SQL.
- Migration `archive_legacy_tables`: move `reviews_backup_cp`, `review_collaborators_backup_cp`, `reviews_legacy_archive`, `reviews_raw_legacy_archive` para schema `archive.*` com RLS restritiva e `revoke all from anon, authenticated`.
- Migration `consolidate_location_id`: reassocia os 4.421 reviews de `cartorio_paulista_main` → `cartorio-paulista-location` e atualiza rows dependentes. Também normaliza `gbp_locations`.
- CI gate: `gitleaks` + `migration-lint` + `no-env-files`.
- Backend e frontend ficam em mode "hello world" (scaffolding da Fase −1). O acesso a dados será entregue na Fase 1.

**Critério de aceitação:** as duas chaves legadas retornam 401; `select count(*) from pg_tables where rowsecurity = false and schemaname = 'public'` retorna 0; invocação de `get_reviews_stats` com anon key retorna 403; `select count(*) from public.reviews_backup_cp` falha (`relation not found`); todas as 5.372 rows de `reviews` têm `location_id = 'cartorio-paulista-location'`; CI verde.

---

### Fase 1 — Auth & Backend BFF
**Objetivo:** primeiro caminho real de acesso a dados, autenticado e seguro.

- Backend FastAPI com estrutura `app/api/v1/auth`, `app/core/security`, `app/services/supabase_auth`, `app/db/session`.
- Integração Supabase Auth via `gotrue-py` (ou HTTP direto em `httpx`): login, refresh, reset de senha, invite.
- Middleware de sessão: lê cookie httpOnly, valida JWT local via JWKS do Supabase, popula `request.state.user`.
- Dependency injection de role: `require_role('admin')`, `require_authenticated`.
- Tabela `user_profiles` (user_id FK para `auth.users`, `role`, `created_at`, `disabled_at`).
- Seed do primeiro admin via comando manual (`python -m backend.scripts.bootstrap_admin`) fora da UI.
- Rate limiting de auth endpoints via Redis (5 tentativas / 15 min / IP + e-mail).
- Frontend: páginas `/login`, `/logout`, `/forgot-password`, `/reset-password`. Router guard redirecionando rotas protegidas para `/login`. Axios client com `withCredentials: true`.
- E2E Playwright: login, logout, acesso negado sem cookie, rota admin bloqueada para viewer.
- Sentry no backend e frontend.

**Critério de aceitação:** visitar qualquer rota sem sessão redireciona para `/login`; `POST /api/auth/login` com credenciais válidas retorna cookie Set-Cookie httpOnly + user object; middleware rejeita token expirado; E2E passa; um usuário `viewer` recebe 403 ao tentar `PATCH /api/admin/collaborators/:id`; rate limit bloqueia 6ª tentativa de login em <15 min.

---

### Fase 2 — Collaborators Admin Panel
**Objetivo:** CRUD completo de colaboradores + merge de duplicatas + gestão de aliases.

- Backend: endpoints `/api/admin/collaborators` (GET list/search, POST create, PATCH update, DELETE soft-delete, POST merge).
- Merge lógica: fundir dois colaboradores, transferir `review_collaborators` para o canônico, atualizar `aliases[]` com os do absorvido, registrar em `audit_log`.
- Tabela `audit_log` append-only (quem fez o quê, quando, diff JSON).
- Import/export CSV.
- Frontend: página `/admin/collaborators` (restrita a admin+manager) com lista (TanStack Table), formulário de criar/editar, dialog de merge com preview de menções afetadas, toggle "incluir inativos".
- Atualização do algoritmo de matching: quando aliases mudam, enfileirar job arq `reprocess_collaborator_mentions` que roda em worker.
- E2E Playwright: criar, editar, desativar, fundir, reprocessar.

**Critério de aceitação:** admin cria/edita/desativa/funde colaboradores via UI; toda mudança aparece em `audit_log`; viewer não vê o menu admin; após merge de A em B, todas as `review_collaborators.collaborator_id = A` viram B e `aliases` de B contém os de A; CSV export/import round-trip.

---

### Fase 3 — Visualization Dashboard Refactor
**Objetivo:** reconstruir a experiência de visualização atual sobre o novo BFF, sem mocks silenciosos.

- Páginas `/dashboard`, `/reviews`, `/collaborators`, `/analytics`, `/trends` consumindo `/api/*` via TanStack Query.
- Zero fallback mockado: erro de API → toast + error boundary com mensagem clara.
- Paginação cursor-based em listings grandes (reviews).
- KPI cards (total, avg rating, 5★%, menções/colaborador), gráficos (recharts) de tendência, tabela de menções por colaborador por mês, filtros por período.
- Loading states esqueletos. Estados vazios explicativos.
- Design system shadcn/ui + Tailwind v4 consolidado.
- E2E cobrindo os fluxos principais de leitura.

**Critério de aceitação:** dashboard navegável com dados reais do Supabase via BFF; simular 500 na API retorna mensagem clara (não dado falso); filtros por mês funcionam; paginação de reviews em listagem >500 itens.

---

### Fase 4 — Scraper Rebuild & Automation
**Objetivo:** coleta autônoma de reviews via arq worker + scheduled tasks.

- Decisão fonte: **DataForSEO como primário** (se cobrir 100% do volume) ou **Playwright async em Python como fallback**.
- Task arq `collect_reviews(location_id)`: chama DataForSEO, normaliza, faz upsert em `reviews` + `reviews_raw` com idempotência. Retry exponencial, DLQ.
- Task arq `link_collaborator_mentions(review_id)`: dispara para cada review novo.
- Task arq `classify_review(review_id)`: sentiment + is_enotariado.
- Task arq `refresh_monthly_view`: agendada diária.
- arq cron config: `{'collect_reviews': {'cron': '0 */1 * * *'}}` (de hora em hora).
- Tabela `job_runs` no Postgres registra início/fim/status/error/correlation_id.
- Endpoint `/api/metrics/collection-health` expõe última sincronização, sucesso dos últimos 10 runs.
- Edge Function `alerts` **aposentada**; alertas via task arq que envia e-mail Resend se `job_runs` não tem sucesso há >2h.
- Healthcheck por worker container.

**Critério de aceitação:** sem intervenção humana por 24h, novos reviews aparecem dentro de 1h da publicação; dashboard operacional mostra última sincronização <1h; falha injetada gera alerta dentro de 2h; teste de idempotência cobre dupla execução.

---

### Fase 5 — Observability & Hardening
**Objetivo:** sustentabilidade de longo prazo.

- Sentry SDK Python no backend e workers; Sentry SDK JS no frontend. Source maps upload no build.
- structlog JSON com correlation ID em stdout (Railway captura automaticamente).
- Métricas Prometheus em `/metrics` do backend (opt-in para futura integração).
- Runbooks em `docs/runbooks/`: rotação de credencial, coleta parada, restore de backup, bootstrap de novo ambiente, deploy, rollback.
- LGPD: retenção de 24 meses, endpoint de anonimização (`reviewer_name` → hash), audit log completo, export sob demanda.
- Backup adicional: task arq semanal exportando `pg_dump` lógico para Supabase Storage bucket `backups/` ou S3 externo.
- Load test básico no backend (`locust`).
- Documento final `docs/architecture.md`.
- GitHub Actions: pipeline completo (lint + typecheck + unit + integration + e2e + deploy trigger).

**Critério de aceitação:** erro forçado aparece em Sentry com stack completa + correlation ID; runbook testado em exercício dry-run; backup externo completa sem erro; `locust -u 100 -r 10 -t 60s` no backend não gera erros; CI gate bloqueia merge sem testes passando.

---

## Ordem e paralelismo

`Fase −1 → Fase 0 → Fase 1 → (Fase 2 ∥ Fase 3) → Fase 4 → Fase 5`

- **Fase −1 antes de tudo**, pois define a estrutura de diretórios e dependências.
- **Fase 0 antes da 1**, pois qualquer backend que fale com Supabase precisa primeiro que as credenciais legadas sejam revogadas e as policies sejam sanas.
- **Fase 1 é pré-requisito de 2, 3 e 4** — acesso autenticado é condição.
- **Fases 2 e 3** podem ser desenvolvidas em paralelo após Fase 1, em sessões distintas, sem sobreposição de arquivos (2 foca em `/admin/collaborators`, 3 foca em `/dashboard`, `/reviews`, etc.).
- **Fase 4** depende do backend estável e RLS consolidada.
- **Fase 5** é transversal, concentrada no fim para não atrapalhar velocidade inicial.

---

## Out of Scope (explícito)

- Multi-tenant real (múltiplos cartórios). Schema preserva `location_id`, UX não.
- App mobile nativo.
- IA generativa para resposta automática a reviews.
- Migração para outro provedor de banco (AWS RDS, etc.). Supabase é a escolha.
- Reescrita do scraper em Go ou outra linguagem. Se reconstruído, permanece Python.
- Uso de Next.js ou Vercel em qualquer ponto da stack.
- Uso de Node.js no backend / workers / scraper.

---

## Referências cruzadas

- Constituição → `CONSTITUTION.md`
- Decisões técnicas atualizadas → `DESIGN-DISCUSSION.md`
- Questões pendentes (resolvidas/abertas) → `OPEN-QUESTIONS.md`
- Audit do estado atual → `research/CURRENT-STATE-AUDIT.md`
- Inventário de schema → `research/SCHEMA-INVENTORY.md`
- **Snapshot real de produção** → `phase-0-security-baseline/snapshot/prod-state-2026-04-09.md`
- Spec da fase atual (Fase −1 Cleanup) → `phase-minus-1-cleanup/SPEC.md`
- Spec da fase seguinte (Fase 0 Security) → `phase-0-security-baseline/SPEC.md`
