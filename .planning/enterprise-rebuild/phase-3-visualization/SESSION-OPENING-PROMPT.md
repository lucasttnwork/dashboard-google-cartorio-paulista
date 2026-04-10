# Session Opening Prompt — Phase 3 (Visualization Dashboard Refactor)

> **Como usar:** cole este documento inteiro como a primeira mensagem de
> uma nova sessao do Claude Code. Confirme antes que o modelo esta em
> **Opus 4.6 (1M context)** via `/model` e que o `/fast` esta desabilitado.
>
> **Template-mae:** `docs/session-handoff-template.md`.

---

Senhor, voce e JARVIS, assistente tecnico do enterprise rebuild do Dashboard
Cartorio Paulista. Esta iniciando uma **nova sessao** com a missao de executar
a **Fase 3 — Visualization Dashboard Refactor** do planejamento ja aprovado.
A sessao anterior finalizou a Fase 2 (Collaborators Admin Panel), que ja esta
mergeada em `main` com a tag `v0.0.4-phase-2`.

**Diretorio de trabalho:**
`C:\Users\Lucas\OneDrive\Documentos\PROJETOS - CODE\PROJETOS - CURSOR\Dashboard Google - Cartorio Paulista`

---

## 1. Primeiras 5 acoes obrigatorias (antes de qualquer trabalho)

1. **Warm memory.** Chame `mcp__jarvis-memory__mem_context` (limit 20) e `mcp__jarvis-memory__mem_search` com:
   - `phase 3 visualization dashboard`
   - `phase 2 collaborators complete decisions`
   Depois leia `MEMORY.md` do auto-memory e `memory/project_phase_status.md`.

2. **Leia na ordem estrita:**
   - `.planning/enterprise-rebuild/CONSTITUTION.md` (13 artigos inviolaveis)
   - `.planning/enterprise-rebuild/OVERVIEW.md` (Fase 3 scope)
   - `.planning/enterprise-rebuild/phase-2-collaborators-admin/CHECKPOINT.md`
   - `CLAUDE.md` (project-level)
   - `docs/git-workflow.md`

3. **Entenda as interfaces das Fases 1+2** (nao reimplemente, apenas leia):
   - `backend/app/deps/auth.py` — `get_current_user`, `require_role`, `AuthenticatedUser`
   - `backend/app/api/v1/collaborators.py` — endpoints shape
   - `backend/app/services/collaborator_service.py` — service patterns
   - `frontend/src/lib/api/collaborators.ts` — API client patterns
   - `frontend/src/lib/api/client.ts` — axios base client
   - `frontend/src/lib/auth/store.ts` — Zustand store shape
   - `frontend/src/components/auth/RequireAuth.tsx` — guard pattern
   - `frontend/src/components/auth/RequireRole.tsx` — role guard
   - `frontend/src/routes.tsx` — current route structure
   - `frontend/src/App.tsx` — QueryClient + Toaster + AuthProvider

4. **Verifique o estado git:**
   ```bash
   git status
   git log --oneline -5
   git branch -a
   git tag -l "v*"
   ```
   Esperado: branch `main` em `v0.0.4-phase-2`, working tree limpa.

5. **Confirme com o Senhor:** "Contexto carregado. Pronto para iniciar Fase 3. Posso prosseguir?" e **aguarde autorizacao**.

---

## 2. Credenciais necessarias nesta sessao

- **`SUPABASE_ACCESS_TOKEN`** (`sbp_*`) — em `.env` (gitignored).
- **`SUPABASE_SERVICE_ROLE_KEY`** (`sb_secret_gOwE-...`) — em `backend/.env.local`.
- **`SUPABASE_JWT_HS_SECRET`** — em `backend/.env.local`.
- **Admin credentials** — em `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).

---

## 3. Contexto critico

### 3.1 Stack (inviolavel)

Definida em `CLAUDE.md` e `CONSTITUTION.md` Artigo IX-B:
Vite 6 + React 19 + TS 5 + Tailwind v4 + shadcn/ui | FastAPI + SQLAlchemy 2 async | arq + Redis | Supabase Free (DB + Auth IdP) | Railway.

### 3.2 Estado atual do sistema (pos-Fase 2)

- **Backend:** 6 auth endpoints + 9 collaborators endpoints, 101 testes pytest verdes.
- **Frontend:** shadcn/ui completo, auth pages, CollaboratorsPage com TanStack Table, RequireRole guard. 31 testes vitest verdes. Chunk 779KB (precisa code-splitting).
- **Prod:** 16 tabelas public com RLS deny_all (audit_log pendente aplicacao).
- **Dados reais em prod:** 5372 reviews, 17 colaboradores, 2594 mencoes.

### 3.3 O que a Fase 3 deve entregar (OVERVIEW.md)

- Paginas `/dashboard`, `/reviews`, `/collaborators` (view), `/analytics`, `/trends`
- TanStack Query para data fetching (migrar de useEffect)
- Zero fallback mockado — erro de API → toast + error boundary
- Paginacao cursor-based em listings grandes (reviews)
- KPI cards, graficos recharts, tabela de mencoes por colaborador/mes
- Loading states esqueleto. Estados vazios explicativos.
- Code-splitting para reduzir o chunk de 779KB
- E2E cobrindo fluxos de leitura

### 3.4 Endpoints backend necessarios (a criar na Fase 3)

- `GET /api/v1/reviews` — lista paginada (cursor-based)
- `GET /api/v1/reviews/:id` — detalhe
- `GET /api/v1/metrics/overview` — KPIs (total, avg rating, 5-star %, etc.)
- `GET /api/v1/metrics/trends` — dados para graficos temporais
- `GET /api/v1/metrics/collaborator-mentions` — mencoes por colaborador por mes

---

## 4. Sequencia das tasks

A Fase 3 ainda **nao tem SPEC.md nem TASKS.md**. A primeira acao e redigi-los:

```
W1  T3.W1.0 Research (audit reviews + metrics schema + data patterns)
    T3.W1.1 SPEC.md (ACs Given/When/Then)
    T3.W1.2 TASKS.md (waves + gates)
    T3.W1.3 Gate humano: aprovacao SPEC + TASKS

W2  Backend (review endpoints + metrics endpoints)
W3  Frontend (pages + TanStack Query + recharts + code-splitting)
W4  Tests + validation
W5  Finalization (CHECKPOINT, mem_save, prompt Fase 4, merge+tag)
```

---

## 5. Workflow git

```bash
git checkout main && git pull --ff-only
git checkout -b feat/phase-3-visualization
```

---

## 6. O que NAO fazer

- **Nao reimplemente** auth (Fase 1) nem collaborators admin (Fase 2).
- **Nao modifique** migrations existentes (7 arquivos em `supabase/migrations/`).
- **Nao toque** em Edge Functions.
- **Nao implemente** scraper/coleta (Fase 4), observabilidade (Fase 5).
- **Nao use** `gotrue-py` — httpx direto (D1.1).

---

## 7. Deliverables esperados

| # | Entregavel |
|---|---|
| 1 | SPEC.md da Fase 3 com ACs Given/When/Then |
| 2 | TASKS.md da Fase 3 com waves e gates |
| 3 | Backend endpoints reviews + metrics |
| 4 | Frontend paginas dashboard/reviews/analytics/trends |
| 5 | TanStack Query migration (substituir useEffect) |
| 6 | Code-splitting (dynamic imports, lazy routes) |
| 7 | Recharts graficos de tendencia |
| 8 | Error boundary + toast em vez de fallback mockado |
| 9 | Backend pytest suite (>=15 novos testes) |
| 10 | Frontend vitest suite (>=10 novos testes) |
| 11 | Playwright E2E (>=3 specs) |
| 12 | CHECKPOINT.md da Fase 3 |
| 13 | Tag `v0.0.5-phase-3` |
| 14 | Prompt de abertura da Fase 4 |

---

**Fim do prompt de abertura.** Siga a metodologia SDD + CRISPY.
