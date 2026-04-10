# TASKS — Phase 3: Visualization Dashboard Refactor

**SPEC:** `phase-3-visualization/SPEC.md`
**Branch:** `feat/phase-3-visualization`

---

## Legenda

- :robot: Agente executa autonomamente
- :standing_person: Gate humano — aguardar aprovacao
- [P] Paralelizavel com a task anterior
- [S] Sequencial — depende da anterior

---

## Wave 1 — Spec & Planning

| Task | Tipo | Descricao |
|------|------|-----------|
| T3.W1.0 | :robot: | Research: audit schema reviews/metrics, data patterns, frontend deps |
| T3.W1.1 | :robot: | Redigir SPEC.md com ACs Given/When/Then |
| T3.W1.2 | :robot: | Redigir TASKS.md com waves e gates |
| T3.W1.3 | :standing_person: | **GATE:** Senhor aprova SPEC + TASKS |

**Criterio de saida W1:** SPEC.md e TASKS.md commitados, aprovados pelo Senhor.

---

## Wave 2 — Backend (Review + Metrics Endpoints)

| Task | Tipo | Dep | Descricao |
|------|------|-----|-----------|
| T3.W2.0 | :robot: | [S] | Scaffolding: ORM models (Review, ReviewLabel), Pydantic schemas (review, metrics) |
| T3.W2.1 | :robot: | [P] | Endpoint `GET /api/v1/reviews` — lista paginada cursor-based |
| T3.W2.2 | :robot: | [P] | Endpoint `GET /api/v1/reviews/{review_id}` — detalhe com mentions |
| T3.W2.3 | :robot: | [P] | Endpoint `GET /api/v1/metrics/overview` — KPIs agregados |
| T3.W2.4 | :robot: | [P] | Endpoint `GET /api/v1/metrics/trends` — serie temporal mensal |
| T3.W2.5 | :robot: | [P] | Endpoint `GET /api/v1/metrics/collaborator-mentions` — mencoes por colaborador/mes |
| T3.W2.6 | :robot: | [S] | Wire routers em main.py, smoke test manual |

**Criterio de saida W2:** 5 endpoints respondem com dados corretos em dev
(pytest ou curl). Commit atomico.

---

## Wave 3 — Frontend (Pages + TanStack Query + Recharts + Code-Splitting)

| Task | Tipo | Dep | Descricao |
|------|------|-----|-----------|
| T3.W3.0 | :robot: | [S] | Install deps: recharts. Criar tipos TS (types/review.ts, types/metrics.ts) |
| T3.W3.1 | :robot: | [S] | API client modules: lib/api/reviews.ts, lib/api/metrics.ts |
| T3.W3.2 | :robot: | [S] | TanStack Query hooks: hooks/use-reviews.ts, hooks/use-metrics.ts |
| T3.W3.3 | :robot: | [S] | Layout shell: AppLayout com sidebar navigation |
| T3.W3.4 | :robot: | [P] | DashboardPage: KPI cards + trend line chart + rating bar chart + top collaborators |
| T3.W3.5 | :robot: | [P] | ReviewsPage: cursor-paginated table + filtros + detail panel |
| T3.W3.6 | :robot: | [P] | AnalyticsPage: trend charts + collaborator mentions table |
| T3.W3.7 | :robot: | [S] | Code-splitting: React.lazy routes, dynamic recharts import |
| T3.W3.8 | :robot: | [S] | TanStack Query migration: refatorar CollaboratorsPage useEffect → useQuery |
| T3.W3.9 | :robot: | [S] | Route update: / → redirect /dashboard, wire all new pages, update nav |
| T3.W3.10 | :robot: | [S] | Error boundary global + toast on query error |

**Criterio de saida W3:** todas as paginas renderizam com dados reais em dev,
code-splitting reduz maior chunk < 400KB, zero useEffect fetch. Commit atomico.

---

## Wave 4 — Tests

| Task | Tipo | Dep | Descricao |
|------|------|-----|-----------|
| T3.W4.0 | :robot: | [S] | Backend pytest: review list, review detail, metrics overview, trends, collaborator-mentions (>=15 testes) |
| T3.W4.1 | :robot: | [P] | Frontend vitest: DashboardPage, ReviewsPage, AnalyticsPage, hooks, API clients (>=10 testes) |
| T3.W4.2 | :robot: | [P] | Playwright E2E: dashboard loads KPIs, reviews pagination, analytics charts (>=3 specs) |
| T3.W4.3 | :robot: | [S] | Verificar bundle size (vite build + analyze) |

**Criterio de saida W4:** todos os testes verdes, bundle < 400KB maior chunk.

---

## Wave 5 — Finalization

| Task | Tipo | Dep | Descricao |
|------|------|-----|-----------|
| T3.W5.0 | :robot: | [S] | CHECKPOINT.md da Fase 3 |
| T3.W5.1 | :robot: | [S] | mem_save session_summary |
| T3.W5.2 | :robot: | [S] | Atualizar auto-memory MEMORY.md |
| T3.W5.3 | :robot: | [S] | SESSION-OPENING-PROMPT.md da Fase 4 |
| T3.W5.4 | :standing_person: | [S] | **GATE:** Senhor revisa CHECKPOINT, aprova merge |
| T3.W5.5 | :robot: | [S] | Merge em main, tag `v0.0.5-phase-3`, push |

**Criterio de saida W5:** branch merged, tag criada, prompt da Fase 4 pronto.

---

## Resumo de gates humanos

| Gate | Momento | O que o Senhor decide |
|------|---------|----------------------|
| T3.W1.3 | Apos SPEC + TASKS | Aprovar escopo, endpoints, paginas, ACs |
| T3.W5.4 | Apos testes verdes | Aprovar merge em main |

---

## Estimativa de commits

| Wave | Commits esperados |
|------|-------------------|
| W1 | 1 (SPEC + TASKS) |
| W2 | 1 (backend endpoints) |
| W3 | 1 (frontend pages + code-splitting) |
| W4 | 1 (tests) |
| W5 | 1 (finalization + CHECKPOINT) |
| **Total** | **5 commits** |
