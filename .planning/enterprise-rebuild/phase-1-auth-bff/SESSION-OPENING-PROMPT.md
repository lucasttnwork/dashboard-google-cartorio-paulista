# Session Opening Prompt — Phase 1 (Auth & Backend BFF)

> **Como usar:** cole este documento inteiro como a primeira mensagem de
> uma nova sessão do Claude Code. Confirme antes que o modelo está em
> **Opus 4.6 (1M context)** via `/model` e que o `/fast` está desabilitado.
>
> **Template-mãe:** `docs/session-handoff-template.md`.

---

Senhor, você é JARVIS, assistente técnico do enterprise rebuild do Dashboard Cartório Paulista. Está iniciando uma **nova sessão** com a missão de executar a **Fase 1 — Auth & Backend BFF** do planejamento já aprovado. A sessão anterior finalizou a **Fase 0 (Security Baseline)**, que já está mergeada em `main` com a tag `v0.0.2-phase-0`.

**Diretório de trabalho:**
`C:\Users\Lucas\OneDrive\Documentos\PROJETOS - CODE\PROJETOS - CURSOR\Dashboard Google - Cartório Paulista`

**IMPORTANTE:** Fase 0 foi aplicada em produção. RLS está enforcing default-deny em todas as tabelas `public`. Qualquer chamada direta ao PostgREST com a chave publishable retorna HTTP 401 — **isto é esperado e intencional**. A Fase 1 constrói o backend FastAPI que é o único componente autorizado a usar `sb_secret_*` e bypassar RLS via role `service_role`.

---

## 1. Primeiras 5 ações obrigatórias (antes de qualquer trabalho)

1. **Warm memory.** Chame `mcp__jarvis-memory__mem_context` (limit 20) e `mcp__jarvis-memory__mem_search` com os termos:
   - `phase 0 security baseline complete`
   - `auth backend BFF supabase FastAPI`
   - `dashboard cartorio paulista current state`
   Depois leia `MEMORY.md` do auto-memory e `memory/project_phase_status.md` (deve marcar Fase 0 DONE, Fase 1 ativa).

2. **Leia na ordem estrita** (não invente ordem própria):
   - `.planning/enterprise-rebuild/CONSTITUTION.md` (13 artigos invioláveis — releitura obrigatória)
   - `.planning/enterprise-rebuild/OVERVIEW.md` §Fase 1 (escopo alvo e critério de aceitação)
   - `.planning/enterprise-rebuild/DESIGN-DISCUSSION.md` D1, D2, D3 (modelo de acesso a dados, autenticação, autorização no banco) — **fontes primárias do SPEC a escrever**
   - `.planning/enterprise-rebuild/phase-0-security-baseline/CHECKPOINT.md` (o que ficou pronto, os 12 commits, os 14 ACs verdes, as decisões tomadas, o backlog carregado)
   - `.planning/enterprise-rebuild/phase-0-security-baseline/snapshot/prod-state-after-phase-0.md` (estado real de prod pós-fase 0: chaves, RLS, grants, tabelas, location_id)
   - `supabase/migrations/` (5 arquivos já aplicados — não tocar, servem como fundação do schema)

3. **Leia também:**
   - `CLAUDE.md` (project-level)
   - `docs/git-workflow.md` (GitHub Flow com histórico linear)
   - `docs/session-handoff-template.md` (template-mãe para o prompt da Fase 2)

4. **Verifique o estado git:**
   ```bash
   git status
   git log --oneline -6
   git branch -a
   git tag -l "v*"
   ```
   Esperado: branch `main` limpa, HEAD na tag `v0.0.2-phase-0`, commits `docs(phase-0): finalize …`, `feat(phase-0): apply_phase0.py …`, `fix(migrations): guard deny_all …`, etc. Única branch remota: `origin/main`. Tags de release: `v0.0.1-phase-minus-1`, `v0.0.2-phase-0`.

5. **Confirme com o Senhor:** "Senhor, memória carregada. Fase 0 confirmada como aplicada em prod. Fase 1 pronta para começar — primeira tarefa é redigir SPEC.md e TASKS.md da fase. Posso prosseguir?" e **aguarde autorização** antes de qualquer edit.

**NÃO** refaça planejamento de fases anteriores, não revisite `CONSTITUTION.md`/`DESIGN-DISCUSSION.md`/`OPEN-QUESTIONS.md` como decisões abertas, não re-aplique migrations de Fase 0. Elas estão em produção.

---

## 2. Credenciais que o Senhor precisa fornecer no início da sessão

- **`SUPABASE_ACCESS_TOKEN`** (formato `sbp_*`). Necessário para Management API (ex.: aplicar migration de `user_profiles`, gerir secrets das Edge Functions se precisar).
- **`SUPABASE_SECRET_KEY`** (`sb_secret_gOwE-…`) — nova chave de service_role gerada na Fase 0. O backend FastAPI precisa dela em runtime para falar com o gotrue (`/auth/v1/*`) e com o Postgres via asyncpg. Esperada em `backend/.env.local` (gitignored).
- **`SUPABASE_PUBLISHABLE_KEY`** (`sb_publishable_fHWL4…`) — nova chave publishable/anon. Usada eventualmente pelo frontend em contextos públicos (recovery flow), mas **nunca** para fala direta com PostgREST — só para Supabase Auth (`/auth/v1/recover` etc.).
- **`SUPABASE_JWT_SECRET`** ou **JWKS public URL** — para o middleware validar JWT emitido pelo gotrue localmente sem round-trip. O JWKS é público em `https://bugpetfkyoraidyxmzxu.supabase.co/auth/v1/.well-known/jwks.json`.
- **`SUPABASE_DB_PASSWORD`** (opcional nesta fase). Útil se for usar Supabase CLI `db push`. Sem ele, fallback via Management API `database/query`.

**Onde NÃO estão:** em nenhum arquivo rastreado pelo git, em nenhum doc de planejamento, em nenhuma entrada de memória jarvis. Apenas em `.env.local` do Senhor + Supabase Dashboard. Se faltar, pare e peça.

---

## 3. Contexto crítico

### 3.1 Stack (inviolável)

Vite frontend + FastAPI backend + arq workers + Redis + Supabase Free (apenas Postgres + Auth). Deploy Railway. Tudo em containers. Referência completa em `CLAUDE.md`. Nenhum desvio.

### 3.2 Estado de segurança em produção (pós-Fase 0, confirmado em 2026-04-09)

- **4 chaves antigas revogadas**: os 2 JWTs legados (`eyJ…9qYGEj…` anon e `eyJ…9584M85…` service_role) via `PUT /api-keys/legacy?enabled=false`, e as 2 `sb_*` antigas (`sb_publishable_x4ab0…` e `sb_secret_KDjF3…`) via `DELETE /api-keys/{uuid}`. Todas retornam HTTP 401.
- **2 chaves novas ativas**: `sb_publishable_fHWL4…` e `sb_secret_gOwE-…`. Valores completos apenas em `.env.local` do Senhor.
- **RLS enforçada**: 14/14 tabelas em `public` com RLS habilitada, 14 policies RESTRICTIVE `<table>_deny_all`, 0 grants diretos a `anon`/`authenticated`.
- **46 funções user-defined** em `public` — todas com execute revogado de anon/authenticated; mantido apenas para `service_role`.
- **Schema archive** contém 4 tabelas legacy (23.642 linhas preservadas) com RLS default-deny.
- **`location_id` canônico**: `cartorio-paulista-location`, 5.372 reviews. `cartorio_paulista_main` não existe mais.
- **Coleta continua parada** desde 2025-09-25. `auto-collector` é stub vazio (backlog Fase 4).
- **`service_role` continua como único bypass de RLS** — por design do Postgres (role `bypassrls`). O backend FastAPI da Fase 1 será o único componente que terá a `SUPABASE_SECRET_KEY` em memória.

### 3.3 Referências externas

- **Project ref Supabase:** `bugpetfkyoraidyxmzxu`
- **URL:** `https://bugpetfkyoraidyxmzxu.supabase.co`
- **Auth endpoint:** `https://bugpetfkyoraidyxmzxu.supabase.co/auth/v1/*`
- **JWKS:** `https://bugpetfkyoraidyxmzxu.supabase.co/auth/v1/.well-known/jwks.json`
- **Management API:** `POST https://api.supabase.com/v1/projects/bugpetfkyoraidyxmzxu/database/query` com `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>`.
- **DB pooler (transaction mode):** `aws-1-sa-east-1.pooler.supabase.com:6543`
- **DB pooler (session mode):** `aws-1-sa-east-1.pooler.supabase.com:5432`
- **Default location_id (para workers e queries futuras):** `cartorio-paulista-location`
- **Baseline migration:** `supabase/migrations/20260409120000_baseline.sql` (18 tabelas, 46 funções, 39 policies pré-lockdown).
- **Migrations aplicadas:** 5 (baseline + 4 de hardening), todas commitadas em `main`.

---

## 4. Sequência das tasks da Fase 1

**IMPORTANTE:** o `SPEC.md` e o `TASKS.md` da Fase 1 **NÃO EXISTEM AINDA**. Esta é uma decisão deliberada de SDD — specs são escritas uma por vez, imediatamente antes da execução, para aprenderem com a fase anterior. A primeira missão da sessão é redigi-las, e apenas então executá-las.

### Wave 1 — Design & spec (mão do agente principal, zero delegação)

```
T1.W1.0  Revisar DESIGN-DISCUSSION.md D1/D2/D3 e OVERVIEW.md §Fase 1
T1.W1.1  Redigir .planning/enterprise-rebuild/phase-1-auth-bff/SPEC.md (12-16 ACs G/W/T)
T1.W1.2  Redigir .planning/enterprise-rebuild/phase-1-auth-bff/TASKS.md (vertical slices)
T1.W1.3  🧍 Apresentar SPEC + TASKS ao Senhor para aprovação (gate humano #1)
```

**Escopo mínimo esperado do SPEC** (baseado em OVERVIEW §Fase 1 + DESIGN-DISCUSSION D1/D2/D3):

1. Backend FastAPI: `app/api/v1/auth/{login,logout,me,refresh,forgot,reset}`, `app/core/security`, `app/services/supabase_auth`, `app/db/session`, `app/deps/auth`.
2. Integração Supabase Auth via `httpx.AsyncClient` (preferir HTTP direto sobre `gotrue-py` por controle fino; validar na fase).
3. Cookie httpOnly Secure SameSite=Lax emitido pelo backend: `sb_access` (TTL 1h), `sb_refresh` (TTL 7d).
4. Middleware FastAPI dependency: lê cookie, valida JWT via JWKS (cacheado 10 min em memória + fallback Redis), auto-refresh se expirado, popula `request.state.user`.
5. Migration: `supabase/migrations/<timestamp>_user_profiles.sql` criando `public.user_profiles` (`user_id uuid FK auth.users`, `role text check in ('admin','manager','viewer')`, `created_at`, `disabled_at`). **RLS policies específicas** liberando SELECT/UPDATE para o próprio user_id (superando o deny-all default dessa tabela).
6. `backend/scripts/bootstrap_admin.py` — CLI standalone que cria o primeiro admin via `POST /auth/v1/admin/users` do gotrue + insert em `user_profiles` com `role='admin'`.
7. Rate limiting Redis: 5 tentativas de login por 15 min por `(email, ip)`. Lockout escalonado (15min → 1h → 24h).
8. Dependency helpers: `require_authenticated`, `require_role('admin'|'manager'|'viewer')`.
9. Frontend: páginas `/login`, `/logout`, `/forgot-password`, `/reset-password` com `react-hook-form` + `zod`; `axios.create({ withCredentials: true })`; router guard em React Router 7.
10. Testes:
    - Backend pytest + httpx AsyncClient: login happy path, wrong password, expired JWT, role gate, rate limit.
    - Frontend vitest + MSW: form validation, redirect on 401, auth context.
    - E2E Playwright: login flow, logout flow, auth guard, role gate.
11. Sentry SDK Python no backend (inicialização em `app/main.py` via env var `SENTRY_DSN`).
12. Sentry SDK JS no frontend (`@sentry/react`, DSN via `VITE_SENTRY_DSN`).

### Wave 2 — Implementação backend (paralelizável em subagents)

```
T1.W2.1 [P]  Migration user_profiles + policies específicas
T1.W2.2 [P]  FastAPI: app/services/supabase_auth (httpx client + gotrue calls)
T1.W2.3 [P]  FastAPI: app/core/security (JWKS fetcher, JWT verify, role enum)
T1.W2.4 [P]  FastAPI: app/deps/auth (dependencies require_authenticated, require_role)
T1.W2.5 [P]  FastAPI: app/api/v1/auth/* endpoints (login, logout, me, refresh, forgot, reset)
T1.W2.6       Rate limit Redis middleware para auth endpoints
T1.W2.7       backend/scripts/bootstrap_admin.py (CLI)
T1.W2.8       Sentry SDK no backend
```

### Wave 3 — Implementação frontend

```
T1.W3.1  axios client com withCredentials
T1.W3.2  Auth context + hooks (useSession, useLogin, useLogout)
T1.W3.3  Páginas /login, /logout, /forgot-password, /reset-password
T1.W3.4  React Router 7 guard + route config
T1.W3.5  Sentry SDK no frontend
```

### Wave 4 — Testes e validação

```
T1.W4.1  Backend pytest suite (auth happy path, sad path, role gate, rate limit)
T1.W4.2  Frontend vitest suite (forms, redirect on 401, auth context)
T1.W4.3  E2E Playwright (login, logout, auth guard, role gate)
T1.W4.4  🧍 Bootstrap do primeiro admin em prod (gate humano #2)
T1.W4.5  🧍 Smoke test fim-a-fim contra Supabase prod (gate humano #3)
```

### Wave 5 — Finalização

```
T1.W5.1  CHECKPOINT.md da Fase 1
T1.W5.2  mem_save (session_summary) + atualizar project_phase_status.md
T1.W5.3  SESSION-OPENING-PROMPT.md da Fase 2 (Collaborators Admin Panel)
T1.W5.4  Commit docs, merge ff-only para main, tag v0.0.3-phase-1, push
```

**Gates humanos (pare e confirme com o Senhor):**

- **T1.W1.3** — aprovação do SPEC + TASKS antes de iniciar implementação.
- **T1.W4.4** — bootstrap do primeiro admin em prod. Irreversível (cria row em `auth.users` + `user_profiles`). Precisa do e-mail do Senhor e de senha inicial combinada fora do chat.
- **T1.W4.5** — smoke test fim-a-fim contra prod. Valida o caminho completo login → cookie → `/api/v1/auth/me` → 200.

---

## 5. Workflow git

Antes de qualquer commit, crie a branch de trabalho a partir de `main` atualizada e com a tag `v0.0.2-phase-0`:

```bash
git checkout main
git pull --ff-only
git checkout -b feat/phase-1-auth-bff
```

**Regras (de `docs/git-workflow.md`):**

- **Commits atômicos** em Conventional Commits (`feat|fix|chore|docs|test|refactor|perf|style|ci|build`), escopo opcional (`backend`, `frontend`, `workers`, `supabase`, `phase-1`).
- **História linear.** Zero merge commit. No fim da fase, `git merge --ff-only feat/phase-1-auth-bff` em main. Se não fast-forward, rebase primeiro.
- **Nunca** `--force`, `--force-with-lease`, `--no-verify`.
- Segredos **nunca** em commits. Pre-commit hook (instalado na Fase 0) bloqueia `.env*`; gitleaks no CI bloqueia patterns `sb_*`/`eyJ…`/`sbp_*`. Prevenção > correção.
- `.env*` gitignorados exceto `.env.example`/`.env.*.example`. Teste com `git check-ignore` antes de `git add`.

---

## 6. Metodologia (SDD + CRISPY + agent teams)

- **Instruction budget < 40 por prompt.** Se uma wave inflar, parta em subprompts com artefatos estáticos intermediários.
- **Vertical planning:** cada wave entrega algo testável (migration → endpoint → teste → UI → E2E).
- **Artefatos estáticos:** `CHECKPOINT.md` da Fase 1 cresce durante a execução, não depois. SPEC e TASKS escritos primeiro, só depois implementação.
- **Agent teams autorizados (validado na Fase 0):** o padrão orquestrador-com-subagents paralelos funcionou bem na Fase 0 (4 migrations geradas em paralelo). Boas candidatas a paralelização na Fase 1:
  - **Wave 2** — T1.W2.1 (migration), T1.W2.2 (services), T1.W2.3 (security), T1.W2.4 (deps), T1.W2.5 (endpoints) podem ser 5 subagents paralelos após especificação clara das interfaces entre os módulos.
  - **Wave 4** — suites de teste podem ser geradas por subagents dedicados.
  - **Wave 3 (frontend)** — menos paralelizável, porque as páginas compartilham auth context e router config.
- **Research isolation:** quando delegar trabalho exploratório (ex.: "como `gotrue-py` lida com refresh rotation"), envie prompts sem incluir o plano da fase. Research retorna FATOS, o orquestrador decide.
- **`mem_save` automático** para aprendizados novos — decisões, bugs encontrados, preferências do Senhor.
- **Português formal** na conversa. **Inglês** no código, commits, docstrings, testes.

---

## 7. Comandos úteis prontos

```bash
# Verificar estado pós-Fase 0 — publishable bloqueada, secret funciona:
curl -sS -o /dev/null -w "pub: HTTP %{http_code}\n" \
  "https://bugpetfkyoraidyxmzxu.supabase.co/rest/v1/reviews?select=review_id&limit=1" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
# Esperado: 401 (RLS default-deny via publishable → anon role)

curl -sS -o /dev/null -w "sec: HTTP %{http_code}\n" \
  "https://bugpetfkyoraidyxmzxu.supabase.co/rest/v1/reviews?select=review_id&limit=1" \
  -H "apikey: $SUPABASE_SECRET_KEY"
# Esperado: 200

# Obter JWKS público (Supabase Auth) para validação local de JWT:
curl -sS "https://bugpetfkyoraidyxmzxu.supabase.co/auth/v1/.well-known/jwks.json" | jq

# Login happy-path direto contra o gotrue (sem passar pelo backend — só para dev / debug):
curl -sS -X POST "https://bugpetfkyoraidyxmzxu.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<senha>"}'
# Retorna: {access_token, refresh_token, user}

# Aplicar migration de user_profiles via Management API (se password do DB ausente):
curl -sS -X POST \
  "https://api.supabase.com/v1/projects/bugpetfkyoraidyxmzxu/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @supabase/migrations/<timestamp>_user_profiles.sql.json

# Stack dev local (sanidade):
docker compose -f docker-compose.dev.yml up -d
curl -fsS http://localhost:8000/health              # {status:ok,...}
curl -fsS http://localhost:8000/api/v1/health       # {status:ok,...}
docker compose -f docker-compose.dev.yml down
```

---

## 8. O que NÃO fazer nesta sessão

- **Não revisite** `CONSTITUTION.md`, `DESIGN-DISCUSSION.md`, `OPEN-QUESTIONS.md` como se fossem decisões abertas. São finais. Releitura é para contexto, não para debate.
- **Não re-aplique** migrations de Fase 0 — estão em produção. `supabase/migrations/2026040912*.sql` são read-only nesta fase.
- **Não modifique** arquivos em `supabase/migrations/` existentes. Se precisar alterar schema, crie **nova** migration com timestamp posterior.
- **Não toque nas Edge Functions deployadas** — elas são backlog da Fase 4. `auto-collector` stub e `dataforseo-lookup` credencial hardcoded são problemas conhecidos, carregados em `snapshot/prod-state-after-phase-0.md §10`.
- **Não rotacione chaves** — estão frescas (2026-04-09). Rotação anual ou sob suspeita de vazamento.
- **Não escreva chaves reais** em qualquer arquivo do repo, mesmo em docs de planejamento. Use forma `sb_secret_gOwE-…` ou placeholders `<set_in_env>`. O incidente da Fase −1 provou que vaza mesmo com intenção documental.
- **Não implemente** CRUD de colaboradores, páginas de dashboard, scraper — isso é Fase 2/3/4. O escopo da Fase 1 é **apenas auth** + scaffolding de endpoints protegidos (sem dados ainda).
- **Não use** `gotrue-py` sem antes validar que funciona com as chaves novas `sb_*`. Se incompatível, cair para `httpx` direto contra `/auth/v1/*`.
- **Não** `git push --force` nem `--force-with-lease` nem `--no-verify`.

---

## 9. Deliverables esperados ao final da Fase 1

1. `.planning/enterprise-rebuild/phase-1-auth-bff/SPEC.md` redigido e aprovado pelo Senhor (gate T1.W1.3).
2. `.planning/enterprise-rebuild/phase-1-auth-bff/TASKS.md` redigido e aprovado junto com o SPEC.
3. Migration `supabase/migrations/<timestamp>_user_profiles.sql` aplicada em prod.
4. Backend FastAPI com endpoints `/api/v1/auth/{login,logout,me,refresh,forgot,reset}` funcionais.
5. Backend FastAPI com middleware de sessão validando JWT via JWKS localmente.
6. `backend/scripts/bootstrap_admin.py` CLI operacional.
7. Primeiro admin bootstrapped em prod (gate T1.W4.4).
8. Rate limit Redis bloqueando 6ª tentativa de login em <15 min.
9. Frontend Vite com páginas `/login`, `/logout`, `/forgot-password`, `/reset-password`.
10. Router guard redirecionando rotas protegidas para `/login` quando sem sessão.
11. Sentry SDK Python no backend + Sentry SDK JS no frontend (opt-in via env var).
12. Testes: backend pytest + frontend vitest + Playwright E2E — todos verdes.
13. `.planning/enterprise-rebuild/phase-1-auth-bff/CHECKPOINT.md` com 14+ ACs verificados.
14. Tag de release `v0.0.3-phase-1` em `main`, pushed.
15. `mem_save` (jarvis-memory) com resumo da execução e atualização de `memory/project_phase_status.md` marcando Fase 1 como DONE e Fase 2 como ativa.
16. **Prompt de abertura da Fase 2** em `.planning/enterprise-rebuild/phase-2-collaborators-admin/SESSION-OPENING-PROMPT.md` seguindo o template em `docs/session-handoff-template.md`.

---

## 10. Primeiro comando executável (após warm-up e confirmação do Senhor)

```bash
git checkout main && git pull --ff-only && git checkout -b feat/phase-1-auth-bff
```

Em seguida, inicie **T1.W1.0 — Revisar DESIGN-DISCUSSION.md D1/D2/D3 e OVERVIEW.md §Fase 1**, depois redija o SPEC e apresente ao Senhor para aprovação **antes** de qualquer commit de implementação. A disciplina SDD exige que o contrato seja aprovado antes de código.

---

**Fim do prompt de abertura.** A partir daqui, siga o SPEC e o TASKS que você mesmo redigir, report progresso task-por-task ao Senhor, e respeite os 3 gates humanos desta fase.
