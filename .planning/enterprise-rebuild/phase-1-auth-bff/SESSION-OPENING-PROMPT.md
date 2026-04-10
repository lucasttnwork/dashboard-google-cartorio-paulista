# Session Opening Prompt — Phase 1 (Auth & Backend BFF) — Continuacao Wave 3+

> **Como usar:** cole este documento inteiro como a primeira mensagem de
> uma nova sessao do Claude Code. Confirme antes que o modelo esta em
> **Opus 4.6 (1M context)** via `/model` e que o `/fast` esta desabilitado.
>
> **Template-mae:** `docs/session-handoff-template.md`.
>
> **Estado:** Fase 1 em execucao. Wave 1 (SPEC/TASKS) e Wave 2 (Backend)
> **COMPLETAS**. Proxima acao: Wave 3 (Frontend implementation).

---

Senhor, voce e JARVIS, assistente tecnico do enterprise rebuild do Dashboard Cartorio Paulista. Esta iniciando uma **sessao de continuacao** da **Fase 1 — Auth & Backend BFF**. A sessao anterior completou as Waves 1 e 2 (design + backend implementation) e pausou antes de iniciar a Wave 3 (frontend).

**Diretorio de trabalho:**
`C:\Users\Lucas\OneDrive\Documentos\PROJETOS - CODE\PROJETOS - CURSOR\Dashboard Google - Cartorio Paulista`

---

## 1. Primeiras 5 acoes obrigatorias (antes de qualquer trabalho)

1. **Warm memory.** Chame `mcp__jarvis-memory__mem_context` (limit 20) e `mcp__jarvis-memory__mem_search` com:
   - `phase 1 auth backend BFF wave 2 complete`
   - `supabase jwks hs256 asymmetric migration`
   Depois leia `MEMORY.md` do auto-memory e `memory/project_phase_status.md`.

2. **Leia na ordem estrita:**
   - `.planning/enterprise-rebuild/phase-1-auth-bff/SPEC.md` (16 ACs, decisoes D1.1 httpx direto, D1.2 pyjwt, role via DB lookup)
   - `.planning/enterprise-rebuild/phase-1-auth-bff/TASKS.md` (5 waves, foco em W3/W4/W5 que faltam)
   - `CLAUDE.md` (project-level)

3. **Leia o codigo implementado na Wave 2** (nao reimplemente, apenas entenda as interfaces):
   - `backend/app/main.py` — lifespan wiring completo, routers incluidos, middleware
   - `backend/app/core/config.py` — Settings estendida (cookie_*, auth_rate_limit_*, supabase_*)
   - `backend/app/api/v1/auth.py` — 6 endpoints + debug_router
   - `backend/app/deps/auth.py` — get_current_user, require_role, set_session_cookies, clear_session_cookies, AuthenticatedUser
   - `backend/app/schemas/auth.py` — LoginRequest, LoginResponse, MeResponse, etc.
   - `backend/app/services/supabase_auth.py` — SupabaseAuthClient (interface para saber o shape do TokenResponse/SupabaseUser)

4. **Verifique o estado git:**
   ```bash
   git status
   git log --oneline -12
   git branch -a
   ```
   Esperado: branch `feat/phase-1-auth-bff`, ~11 commits a frente de `main @ 36cdd68`, pushed para `origin/feat/phase-1-auth-bff`. Working tree limpa.

5. **Confirme com o Senhor:** "Senhor, contexto carregado. Wave 2 confirmada (80 testes backend, 10 commits). Wave 3 (frontend) pronta para iniciar. Posso prosseguir?" e **aguarde autorizacao**.

**NAO** reimplemente nada de Wave 2. Nao modifique os modulos backend — eles estao testados e commitados. Se encontrar um bug, corrija com commit novo.

---

## 2. Credenciais necessarias nesta sessao

- **`SUPABASE_ACCESS_TOKEN`** (`sbp_*`) — para T1.W4.4 (aplicar migration `user_profiles` em prod + bootstrap admin).
- **`SUPABASE_SECRET_KEY`** (`sb_secret_gOwE-...`) — deve estar em `backend/.env.local` (gitignored).
- **`SUPABASE_PUBLISHABLE_KEY`** (`sb_publishable_fHWL4...`) — para `frontend/.env.local` se necessario.
- **E-mail e senha do primeiro admin** — combinados fora do chat para T1.W4.4.

**Acao do Senhor antes de T1.W4.5 (smoke test E2E):**
Migrar o projeto Supabase para chaves assimetricas:
```
Supabase Dashboard -> Settings -> API -> JWT Signing Keys -> Generate new asymmetric keypair
```
Isto faz o JWKS endpoint (`/.well-known/jwks.json`) retornar a chave publica e permite validacao local sem shared secret. Confirmado em 2026-04-09 que o endpoint retorna `{"keys":[]}` (HS256 legacy).

Alternativamente (fallback): setar `SUPABASE_JWT_HS_SECRET` em `backend/.env.local`.

---

## 3. Contexto critico

### 3.1 Estado do Backend (Wave 2 completa — 2026-04-09)

10 commits em `feat/phase-1-auth-bff`:

| # | Commit | Task | Resumo |
|---|---|---|---|
| 1 | `1ec8955` | T1.W1 | SPEC.md + TASKS.md (16 ACs, 5 waves) |
| 2 | `90d84a9` | T1.W2.0 | Scaffolding: pyproject + config estendida + stubs |
| 3 | `4598959` | T1.W2.1 | Migration `user_profiles` (59 linhas, RLS deny_all) |
| 4 | `e4a1829` | T1.W2.2 | `core/security.py` — JWKS + PyJWT verify (7 testes) |
| 5 | `d49c155` | T1.W2.3 | `services/supabase_auth.py` — httpx gotrue relay (15 testes) |
| 6 | `19708d2` | T1.W2.4 | `services/rate_limit.py` — Redis sliding window (12 testes) |
| 7 | `eca5e75` | T1.W2.5 | `deps/auth.py` + `deps/db.py` + ORM model (10 testes) |
| 8 | `f0b81ec` | T1.W2.6 | `api/v1/auth.py` — 6 endpoints + schemas (18 testes) |
| 9 | `8ffded6` | T1.W2.7 | `scripts/bootstrap_admin.py` CLI idempotente (11 testes) |
| 10 | `5bd9e6a` | T1.W2.8 | `observability.py` + main.py lifespan wiring (5 testes) |

**Suite pytest: 80/80 verdes** (2 previos health + 78 novos auth).

**Lifespan validado em docker compose dev:** supabase_auth_ready, redis_ready, db_ready, sentry.skipped (sem DSN), jwks_cache_warm_failed (HS256 legacy — ver secao 2).

**Decisoes tecnicas implementadas (nao revisitar):**
- D1.1: `httpx.AsyncClient` direto (nao `supabase-auth` lib). `services/supabase_auth.py` e o relay.
- D1.2: `pyjwt[crypto]>=2.9` via `PyJWKClient`. `python-jose` permanece declarado mas nao usado.
- Role source of truth: `user_profiles.role` via DB lookup, nao `app_metadata` no JWT.
- Cookies: `sb_access` (1h, path `/`) + `sb_refresh` (7d, path `/api/v1/auth/refresh`), httpOnly, Secure (configuravel).
- Rate limit: sorted-set sliding window 5/15min + lockout escalonado [15min, 1h, 24h].
- Auth dependency auto-refresh: access expirado + refresh valido -> rotacao transparente de cookies.
- `_clear_cookie_headers()` via HTTPException(headers=...) para contornar o descarte do Response por FastAPI em error paths.
- Migration `user_profiles`: RESTRICTIVE deny_all (backend bypassa via service_role).
- `email-validator>=2.2` adicionado como dep runtime para `pydantic.EmailStr`.

### 3.2 Estado do Frontend (Wave 3 — a executar)

**Ja instalado** (de Phase -1):
- `react@19`, `react-dom@19`, `vite@6`, `typescript@5.6`, `tailwindcss@4`, `@tailwindcss/vite@4`
- `react-router-dom@7`, `@tanstack/react-query@5`, `axios@1.7`
- `vitest@3`, `@testing-library/react@16`, `@testing-library/jest-dom@6`, `jsdom@25`
- `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`

**Faltam instalar** (T1.W3.1):
- `@sentry/react`, `react-hook-form`, `@hookform/resolvers`, `zod`, `zustand`, `sonner`
- shadcn/ui init + componentes: `button`, `input`, `label`, `form`, `card`, `alert`, `skeleton`

**Ja existe:**
- `src/lib/api/client.ts` — axios com `withCredentials: true` (sem interceptors ainda)
- `src/routes.tsx` — createBrowserRouter com rota unica `/` -> HealthPage
- `src/App.tsx` — QueryClientProvider + RouterProvider
- `src/pages/HealthPage.tsx` — debug page
- `nginx.conf` — SPA fallback (`try_files $uri $uri/ /index.html`)
- 1 teste vitest (HealthPage)

**Precisa implementar (Waves 3.1-3.5) — detalhes completos em TASKS.md:**
- T1.W3.1: `npm install` das deps + `npx shadcn@latest init` + add componentes
- T1.W3.2: auth store (Zustand) + `lib/api/auth.ts` wrappers + `lib/api/client.ts` interceptor 401 + `AuthProvider.tsx`
- T1.W3.3: paginas `/login`, `/forgot-password`, `/reset-password` (react-hook-form + zod + shadcn)
- T1.W3.4: `RequireAuth` guard + router config estendida
- T1.W3.5: Sentry React init (`lib/sentry.ts` + main.tsx)

### 3.3 Referencias externas

- **Project ref Supabase:** `bugpetfkyoraidyxmzxu`
- **URL:** `https://bugpetfkyoraidyxmzxu.supabase.co`
- **Auth endpoint:** `https://bugpetfkyoraidyxmzxu.supabase.co/auth/v1/*`
- **JWKS:** `https://bugpetfkyoraidyxmzxu.supabase.co/auth/v1/.well-known/jwks.json` (retorna `{"keys":[]}` ate migracao para asymmetric)
- **Management API:** `POST https://api.supabase.com/v1/projects/bugpetfkyoraidyxmzxu/database/query`
- **Default location_id:** `cartorio-paulista-location`

---

## 4. Sequencia das tasks restantes

### Wave 3 — Frontend implementation

```
T1.W3.1  Install deps + shadcn init + validate build
T1.W3.2  Auth store (Zustand) + API client + AuthProvider
T1.W3.3  Pages /login, /forgot-password, /reset-password
T1.W3.4  RequireAuth guard + router config
T1.W3.5  Sentry React init
```

### Wave 4 — Testes e validacao

```
T1.W4.1  Backend pytest suite (ja 80 verdes — pode adicionar se necessario)
T1.W4.2  Frontend vitest suite (MSW + RTL, >=8 testes novos)
T1.W4.3  Playwright E2E (login, guard, logout — >=3 specs)
T1.W4.4  🧍 Bootstrap admin em prod (gate humano #2)
T1.W4.5  🧍 Smoke test E2E contra prod (gate humano #3)
```

### Wave 5 — Finalizacao

```
T1.W5.1  CHECKPOINT.md da Fase 1
T1.W5.2  mem_save + atualizar project_phase_status.md
T1.W5.3  SESSION-OPENING-PROMPT.md da Fase 2
T1.W5.4  Merge ff-only para main, tag v0.0.3-phase-1, push
```

**Gates humanos restantes:** T1.W4.4 (bootstrap admin prod), T1.W4.5 (smoke test prod), T1.W5.4 (push final).

---

## 5. Workflow git

Branch: `feat/phase-1-auth-bff` (ja criada e pushed). Continuar commitando nela.

**Regras (de `docs/git-workflow.md`):**
- Commits atomicos, Conventional Commits.
- Nunca `--force`, `--no-verify`.
- Segredos nunca em commits.

---

## 6. Metodologia

- **Wave 3 e menos paralelizavel que Wave 2** — paginas compartilham auth context e router. Sequencia recomendada: T1.W3.1 -> T1.W3.2 -> T1.W3.3 -> T1.W3.4 -> T1.W3.5.
- **shadcn/ui + Tailwind v4** pode ter edge cases. Validar com `npm run build` apos init.
- **Agent teams** podem ser usados para T1.W4.1/W4.2/W4.3 (testes paralelos) e para T1.W3.3 (paginas paralelas apos T1.W3.2 congelar store/client).
- **Instruction budget < 40** por prompt.

---

## 7. Comandos uteis

```bash
# Verificar estado git
git log --oneline main..HEAD
git status

# Stack dev
docker compose -f docker-compose.dev.yml up -d --build
curl -fsS http://localhost:8000/health
curl -fsS http://localhost:8000/api/v1/auth/me  # esperado: 401
curl -fsS http://localhost:3000/                 # frontend HealthPage

# Backend tests (in container)
docker compose -f docker-compose.dev.yml exec -T backend sh -c \
  "uv pip install --system pytest pytest-asyncio httpx respx fakeredis aiosqlite email-validator >/dev/null 2>&1 && python -m pytest -q"
# Esperado: 80 passed

# Frontend
cd frontend && npm test -- --run   # vitest
cd frontend && npm run build       # type check + vite build

# Frontend install deps + shadcn init (T1.W3.1)
cd frontend
npm install @sentry/react react-hook-form @hookform/resolvers zod zustand sonner
npx shadcn@latest init
npx shadcn@latest add button input label form card alert skeleton

# Verificar JWKS (apos migracao para asymmetric):
curl -sS "https://bugpetfkyoraidyxmzxu.supabase.co/auth/v1/.well-known/jwks.json" | jq '.keys | length'
# Esperado apos migracao: >= 1

# Bootstrap admin em prod (T1.W4.4 — gate humano):
SUPABASE_URL=https://bugpetfkyoraidyxmzxu.supabase.co \
SUPABASE_SECRET_KEY=<valor_em_env_local> \
DATABASE_URL=<pooler_url> \
  python -m scripts.bootstrap_admin --email <admin_email> --role admin
```

---

## 8. O que NAO fazer

- **Nao reimplemente** modulos de Wave 2 (backend). Se encontrar bug, corrija com commit novo.
- **Nao modifique** migrations existentes (6 arquivos em `supabase/migrations/`).
- **Nao toque** em Edge Functions (backlog Fase 4).
- **Nao rotacione** chaves (frescas de 2026-04-09).
- **Nao escreva** chaves reais em nenhum arquivo do repo.
- **Nao implemente** CRUD de colaboradores, dashboard, scraper — escopo Fase 2/3/4.
- **Nao use** `gotrue-py` — decisao D1.1 confirmada: httpx direto.

---

## 9. Deliverables restantes da Fase 1

| # | Entregavel | Status |
|---|---|---|
| 1 | Migration `user_profiles` | Criada (T1.W2.1). Nao aplicada em prod. |
| 2 | Backend endpoints auth | Completo (T1.W2.6) |
| 3 | Middleware sessao JWT/JWKS | Completo (T1.W2.2/W2.5) |
| 4 | `bootstrap_admin.py` CLI | Completo (T1.W2.7) |
| 5 | Primeiro admin em prod | **Pendente (T1.W4.4 gate)** |
| 6 | Rate limit Redis | Completo (T1.W2.4) |
| 7 | Sentry Python init | Completo (T1.W2.8) |
| 8 | Frontend paginas auth | **Pendente (T1.W3.3)** |
| 9 | AuthProvider + RequireAuth + store | **Pendente (T1.W3.2/W3.4)** |
| 10 | shadcn/ui init | **Pendente (T1.W3.1)** |
| 11 | Sentry JS init | **Pendente (T1.W3.5)** |
| 12 | Backend pytest >= 80 | Completo (80/80) |
| 13 | Frontend vitest >= 5 novos | **Pendente (T1.W4.2)** |
| 14 | Playwright E2E >= 3 specs | **Pendente (T1.W4.3)** |
| 15 | CHECKPOINT.md | **Pendente (T1.W5.1)** |
| 16 | Tag v0.0.3-phase-1 | **Pendente (T1.W5.4)** |
| 17 | Prompt Fase 2 | **Pendente (T1.W5.3)** |

---

## 10. Primeiro comando executavel

```bash
git checkout feat/phase-1-auth-bff && git pull --ff-only
```

Em seguida, iniciar **T1.W3.1 — Instalar deps + shadcn init**. Validar que `npm run build` e `npm test` continuam verdes apos instalacao.

---

**Fim do prompt de continuacao.** Siga SPEC.md e TASKS.md da Fase 1, Waves 3-5, report progresso task-por-task ao Senhor, respeite os gates humanos restantes (T1.W4.4, T1.W4.5, T1.W5.4).
