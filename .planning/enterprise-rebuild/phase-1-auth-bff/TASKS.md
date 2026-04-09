# TASKS — Phase 1: Auth & Backend BFF

> Execução vertical em 5 waves. `[P]` = paralelizável com a anterior dentro da mesma wave. Ícones: 🧍 ação humana, 🤖 agente, ⚠ destrutivo ou irreversível.
>
> Tamanho: S (≤30min), M (≤2h), L (≤4h), XL (meio-turno).

---

## Wave 1 — Design & Spec (esta sessão)

### T1.W1.0 — Research & baseline validation 🤖 ✅

**Objetivo:** produzir fatos sobre o estado atual e os padrões externos antes de desenhar o SPEC.

**Sub-tasks:**
- **T1.W1.0a** Audit `backend/` scaffolding (estrutura, deps, tests, scripts). Delegado a agente Explore.
- **T1.W1.0b** Audit `frontend/` scaffolding (estrutura, deps, rotas, tests, nginx). Delegado a agente Explore.
- **T1.W1.0c** Audit `workers/` + `supabase/` — confirmar ausência de qualquer artefato de auth. Delegado a agente Explore.
- **T1.W1.0d** Research Supabase Auth (gotrue) endpoints, `supabase-auth` vs `httpx` direto, FastAPI JWKS validation. Delegado a agente general-purpose via Context7 + WebFetch.
- **T1.W1.0e** Validação prática da stack dev: `docker compose up`, probes de health, `pytest` backend e workers via container com uv install ad-hoc.

**Saída:** 5 relatórios sintetizados no SPEC §2 (estado atual validado) e §3 (decisões D1.1 e D1.2 fundamentadas).

**Status:** concluído nesta sessão antes da redação do SPEC.

**Tempo real:** M (paralelismo de 4 agentes + validação prática em ~4 min de wall clock).

---

### T1.W1.1 — Redigir SPEC.md 🤖 ✅

**Depende de:** T1.W1.0.

**Objetivo:** produzir `.planning/enterprise-rebuild/phase-1-auth-bff/SPEC.md` com 16 ACs Given/When/Then, invariantes, decisões técnicas resolvidas e limites de escopo.

**Entregável:** `phase-1-auth-bff/SPEC.md`.

**Status:** concluído nesta sessão.

**Tempo real:** M.

---

### T1.W1.2 — Redigir TASKS.md 🤖 ✅

**Depende de:** T1.W1.1.

**Objetivo:** este arquivo. Waves W1–W5, dependências, gates humanos, paralelismo, checklist de done.

**Status:** em execução.

---

### T1.W1.3 — 🧍 Gate humano: aprovação do SPEC + TASKS

**Depende de:** T1.W1.1 + T1.W1.2 concluídos e commitados em `feat/phase-1-auth-bff`.

**O que acontece:**
1. Commitar `SPEC.md` e `TASKS.md` em `feat/phase-1-auth-bff` com mensagem `docs(phase-1): draft spec and tasks (T1.W1)`.
2. Apresentar ao Senhor um resumo de alto nível: 16 ACs, 5 waves, decisões tomadas (httpx direto, pyjwt, role via DB lookup), gates humanos previstos.
3. **Aguardar** aprovação explícita. Senhor pode pedir ajustes — nesse caso, revisar antes de prosseguir.
4. Somente após "aprovado" iniciar Wave 2.

**Critério de sucesso:** Senhor responde aprovando (ou com a lista de ajustes que devem ser aplicados antes de Wave 2).

**Risco:** N/A (gate é a mitigação).

**Tempo:** S (minutos de conversa).

---

## Wave 2 — Backend implementation (equipe paralela de agentes)

> Esta wave foi desenhada para **paralelização máxima**. Os blocos marcados `[P]` podem ser despachados simultaneamente a agentes após a interface entre eles estar congelada na SPEC (o que já está). O orquestrador principal coordena: preparação do esqueleto, depois fan-out, depois fan-in + integração + testes.

### T1.W2.0 — Preparação (sequencial, antes do fan-out) 🤖

**Depende de:** T1.W1.3 aprovado.

**Passos:**
1. Editar `backend/pyproject.toml` adicionando:
   - runtime deps: `pyjwt[crypto]>=2.9`
   - dev deps: `fakeredis>=2.24`, `respx>=0.21`, `aiosqlite>=0.20`
2. Editar `backend/app/core/config.py` estendendo `Settings` com as chaves de §3.2 do SPEC (supabase_publishable_key, jwks_url, audience, issuer, algorithms, cookie_*, auth_rate_limit_*).
3. Criar arquivos vazios com `__init__.py` e stubs nos módulos novos:
   - `app/core/security.py`
   - `app/db/models/__init__.py`, `app/db/models/user_profile.py`
   - `app/deps/__init__.py`, `app/deps/auth.py`, `app/deps/db.py`
   - `app/schemas/__init__.py`, `app/schemas/auth.py`
   - `app/services/__init__.py`, `app/services/supabase_auth.py`, `app/services/rate_limit.py`
   - `app/api/v1/auth.py`
4. Commit: `chore(backend): scaffold auth modules and extend settings (T1.W2.0)`.

**Saída:** estrutura de arquivos pronta para os agentes paralelos trabalharem em isolamento por módulo.

**Verificação:** `docker compose -f docker-compose.dev.yml up -d --build` ainda sobe healthy (sanity check do scaffolding vazio).

**Risco:** B.

**Tempo:** S.

---

### T1.W2.1 [P] — Migration `user_profiles` 🤖

**Depende de:** T1.W2.0.

**Passos:**
1. Gerar timestamp atual: `python -c "from datetime import datetime, timezone; print(datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'))"`.
2. Criar `supabase/migrations/<timestamp>_user_profiles.sql` com o conteúdo de SPEC §3.6 (table, trigger, RLS lockdown, revokes, comments).
3. Dry-run local via Management API BEGIN/ROLLBACK:
   ```python
   # backend/scripts/dry_run_migration.py (se ainda não existir, criar)
   # Executa o SQL envolto em BEGIN; ... ROLLBACK; via Management API.
   ```
4. Se o dry-run passar, **não aplicar em prod ainda** — T1.W4.4 aplica junto do bootstrap admin.
5. Commit: `feat(migrations): add user_profiles table with rls lockdown (T1.W2.1)`.

**Verificação:** dry-run retorna sem erro; o SQL é idempotente (`if not exists` onde apropriado, mas `create table` sem `if not exists` porque migration é one-shot).

**Risco:** B.

**Tempo:** S.

---

### T1.W2.2 [P] — `core/security.py` (JWKS + JWT verify) 🤖

**Depende de:** T1.W2.0.

**Interface pública (contrato com T1.W2.4 e T1.W2.5):**

```python
# backend/app/core/security.py
from dataclasses import dataclass
from uuid import UUID

@dataclass(frozen=True)
class AccessTokenClaims:
    sub: UUID
    email: str | None
    aud: str
    iss: str
    exp: int
    iat: int
    app_metadata: dict[str, object]
    session_id: str | None

class JWTValidationError(Exception): ...
class JWTExpiredError(JWTValidationError): ...

async def verify_access_token(token: str) -> AccessTokenClaims:
    """Verify via JWKS, validate iss/aud/exp/sub. Raise JWTExpiredError
    specifically when expired so that callers can trigger refresh."""

async def warm_jwks_cache() -> None:
    """Invoked at lifespan startup to prefetch JWKS."""
```

**Passos:**
1. Implementar `PyJWKClient` wrapper com TTL 300s, `asyncio.Lock` para stampede protection, fetch via `asyncio.to_thread`.
2. Algoritmos permitidos: `["RS256", "ES256"]` (allow-list explícita).
3. Se `settings.supabase_jwt_issuer` estiver vazio, derivar: `f"{settings.supabase_url.rstrip('/')}/auth/v1"`.
4. Se `settings.supabase_jwks_url` estiver vazio, derivar: `f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"`.
5. Raise `JWTExpiredError` quando pyjwt devolver `ExpiredSignatureError`; qualquer outro erro → `JWTValidationError`.
6. Commit: `feat(backend): jwks jwt validation module (T1.W2.2)`.

**Verificação:** unit test em `tests/test_jwt_validation.py` cobrindo happy, expired, wrong alg, wrong aud, wrong iss, missing sub (parte de T1.W4.1).

**Risco:** M (JWKS fetch pode ser flaky em setup inicial).

**Tempo:** M.

---

### T1.W2.3 [P] — `services/supabase_auth.py` (httpx client) 🤖

**Depende de:** T1.W2.0.

**Interface pública:**

```python
# backend/app/services/supabase_auth.py
from pydantic import BaseModel

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    expires_at: int
    user: "SupabaseUser"

class SupabaseUser(BaseModel):
    id: UUID
    email: str
    app_metadata: dict[str, object]
    user_metadata: dict[str, object]

class SupabaseAuthError(Exception):
    status_code: int
    message: str

class SupabaseAuthClient:
    def __init__(self, *, base_url: str, secret_key: str, http: httpx.AsyncClient): ...
    async def sign_in_with_password(self, email: str, password: str) -> TokenResponse: ...
    async def refresh_session(self, refresh_token: str) -> TokenResponse: ...
    async def get_user(self, access_token: str) -> SupabaseUser: ...
    async def sign_out(self, access_token: str, *, scope: str = "local") -> None: ...
    async def recover_password(self, email: str) -> None: ...
    async def update_user_password(self, access_token: str, new_password: str) -> SupabaseUser: ...
    async def admin_create_user(self, email: str, password: str, *,
                                email_confirm: bool = True,
                                app_metadata: dict | None = None) -> SupabaseUser: ...
```

**Passos:**
1. Header pattern: sempre `apikey: <secret_key>`. Quando endpoint exige o JWT do usuário (logout, get_user, update_user_password), adicionar `Authorization: Bearer <access_token>`. **Nunca** colocar `sb_secret_*` em `Authorization` (research confirmou restrição das novas keys).
2. Base URL: `settings.supabase_url.rstrip("/") + "/auth/v1"`.
3. Mapeamento de erros:
   - `httpx.HTTPStatusError` 400 `invalid_grant` → `SupabaseAuthError(status_code=401, message="invalid_credentials")`
   - `422` validation → `SupabaseAuthError(status_code=400, ...)`
   - `429` → `SupabaseAuthError(status_code=429, ...)`
   - outros 5xx → `SupabaseAuthError(status_code=503, ...)`
4. Unit tests (parte de T1.W4.1) usam `respx` para mockar as rotas gotrue.
5. Commit: `feat(backend): supabase auth relay service via httpx (T1.W2.3)`.

**Verificação:** contra fixture `respx` simulando cada rota, + integration smoke test opcional contra o gotrue real no ambiente de dev (com admin bootstrapped).

**Risco:** M.

**Tempo:** M.

---

### T1.W2.4 [P] — `services/rate_limit.py` (Redis sliding window) 🤖

**Depende de:** T1.W2.0.

**Interface pública:**

```python
# backend/app/services/rate_limit.py
@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    remaining: int
    retry_after_seconds: int

@dataclass(frozen=True)
class LockoutState:
    level: int           # 0 = not locked, 1-3 = escalating
    unlocks_at: datetime | None

class RateLimiter:
    def __init__(self, redis: Redis): ...

    async def hit(self, key: str, *, max_attempts: int, window_seconds: int) -> RateLimitResult: ...
    async def reset(self, key: str) -> None: ...
    async def lockout_status(self, key: str) -> LockoutState: ...
    async def record_failure(self, key: str, *, steps: list[int]) -> LockoutState: ...
    async def clear_lockout(self, key: str) -> None: ...
```

**Passos:**
1. Implementar sliding window via `ZADD` + `ZREMRANGEBYSCORE` + `ZCARD` (padrão Redis).
2. Lockout em chave separada `auth:lockout:{email_lower}:{ip}` com `INCR` + TTL progressivo vindo de `settings.auth_lockout_steps_seconds`.
3. Key builder: `auth_rate_login_key(email, ip) -> "auth:rate:login:{lower(email)}:{ip}"`.
4. Unit tests com `fakeredis.aioredis` em `tests/test_rate_limit.py`.
5. Commit: `feat(backend): redis rate limiter with sliding window and lockout (T1.W2.4)`.

**Verificação:** testes cobrem 5 tentativas OK, 6ª 429, reset após sucesso, escalonamento de lockout, clear_lockout.

**Risco:** B.

**Tempo:** M.

---

### T1.W2.5 [P] — `deps/auth.py` + `deps/db.py` + modelo `user_profile` 🤖

**Depende de:** T1.W2.0 + T1.W2.2 (security interface congelada).

**Interface pública:**

```python
# backend/app/deps/db.py
async def get_session() -> AsyncIterator[AsyncSession]: ...  # FastAPI dep

# backend/app/deps/auth.py
@dataclass(frozen=True)
class AuthenticatedUser:
    id: UUID
    email: str
    role: Literal["admin", "manager", "viewer"]
    created_at: datetime
    disabled_at: datetime | None

async def get_current_user(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
    supabase: SupabaseAuthClient = Depends(get_supabase_auth),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> AuthenticatedUser: ...
    """Reads sb_access cookie, validates via JWKS.
    On JWTExpiredError, reads sb_refresh cookie and tries refresh_session.
    On success, rewrites both cookies in `response` and returns user.
    On any failure, raises HTTPException(401, 'not_authenticated') and
    expires both cookies.
    The role is read from public.user_profiles (SELECT by user_id)."""

def require_authenticated(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    return user

def require_role(*allowed: Literal["admin", "manager", "viewer"]):
    async def _dep(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if user.role not in allowed:
            raise HTTPException(403, "forbidden")
        return user
    return _dep
```

**Passos:**
1. Criar `app/db/models/user_profile.py` com `class UserProfile(Base)` mapeando a tabela (SQLAlchemy 2 async).
2. `deps/db.py`: cria engine no lifespan via `app.state.db_engine`; `get_session` produz `AsyncSession` per request.
3. `deps/auth.py`:
   - Lê cookies (`sb_access`, `sb_refresh`).
   - Se nenhum presente → 401.
   - `verify_access_token(access)` — sucesso → lookup role no DB → retorna.
   - `JWTExpiredError` e `sb_refresh` presente → `supabase.refresh_session(refresh)` → reescreve cookies em `response` → verifica o novo access → retorna.
   - Qualquer falha → 401 com cookies expirados.
4. Cache `user_profiles.role` por user_id no `request.state` para não repetir query dentro da mesma request.
5. Commit: `feat(backend): auth dependencies with role gate and auto-refresh (T1.W2.5)`.

**Verificação:** unit tests em `tests/test_role_gate.py` e `tests/test_auth_me.py`.

**Risco:** M (coordenação com security + supabase_auth).

**Tempo:** L.

---

### T1.W2.6 — `api/v1/auth.py` (endpoints) 🤖

**Depende de:** T1.W2.3, T1.W2.4, T1.W2.5 (usa tudo).

**Passos:**
1. Implementar os 6 endpoints da SPEC §3.5.
2. `schemas/auth.py` com Pydantic v2 models: `LoginRequest`, `ForgotRequest`, `ResetRequest`, `MeResponse`, `LoginResponse`.
3. Cookie helpers em `deps/auth.py` ou em `api/v1/auth.py`: `set_session_cookies(response, token_response)` + `clear_session_cookies(response)`.
4. `/login` usa `Depends(rate_limit_login)` que internamente chama `RateLimiter.hit(...)`.
5. `/logout` faz best-effort revoke no gotrue + clear_cookies (sempre retorna 204).
6. `/me` usa `Depends(require_authenticated)`.
7. Incluir router em `main.py`: `app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])`.
8. Rota debug `GET /api/v1/_debug/admin-only` protegida por `Depends(require_role("admin"))` para AC-1.10 (condicional a `settings.env != "production"`).
9. Commit: `feat(backend): auth endpoints login/logout/me/refresh/forgot/reset (T1.W2.6)`.

**Verificação:** rodando local, `curl` cobre cada endpoint com respostas esperadas. Testes formais em T1.W4.1.

**Risco:** M.

**Tempo:** L.

---

### T1.W2.7 — `scripts/bootstrap_admin.py` (CLI) 🤖

**Depende de:** T1.W2.3, modelo `user_profile`.

**Passos:**
1. `argparse` com `--email`, `--role`, `--dry-run`. `getpass.getpass` para senha.
2. Ler env vars: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`.
3. Chamar `SupabaseAuthClient.admin_create_user`. Se 422 "already exists", listar via `GET /admin/users?email=...` (ou buscar via `PUT /admin/users` idempotente — validar na hora).
4. `INSERT ... ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role, disabled_at=NULL, updated_at=now()`.
5. Imprimir resultado em JSON no stdout.
6. Exit code 0 em sucesso; 1 em erro com stderr explicando.
7. Commit: `feat(backend): bootstrap admin CLI (T1.W2.7)`.

**Verificação:** contra projeto Supabase de dev. Rodar duas vezes e confirmar idempotência.

**Risco:** B.

**Tempo:** M.

---

### T1.W2.8 — Sentry init + X-Request-ID middleware 🤖

**Depende de:** T1.W2.0.

**Passos:**
1. `app/core/observability.py`:
   ```python
   def init_sentry(dsn: str, env: str, release: str) -> None: ...
   ```
   No-op se dsn vazio. `FastApiIntegration(transaction_style="endpoint")`.
2. `main.py` chama `init_sentry` antes do `app = FastAPI(...)` se `settings.sentry_dsn`.
3. Adicionar middleware leve `RequestIdMiddleware` que lê `X-Request-ID` do header (ou gera UUID4) e bind no structlog contextvar. Também seta no response header.
4. Lifespan: `await warm_jwks_cache()` (T1.W2.2) + criar `httpx.AsyncClient` reusado + criar `SupabaseAuthClient` + criar `Redis` + criar `RateLimiter`, anexar em `app.state`.
5. Rota `GET /api/v1/_debug/sentry` (condicional a `env != "production"`) que faz `raise RuntimeError("sentry smoke test")`.
6. Commit: `feat(backend): sentry init, request id middleware and lifespan wiring (T1.W2.8)`.

**Verificação:** `curl -H "X-Request-ID: test-123" .../health` retorna o mesmo ID no header de resposta. Logs mostram `request_id=test-123`.

**Risco:** B.

**Tempo:** M.

---

## Wave 3 — Frontend implementation

> W3 é menos paralelizável que W2 porque as páginas compartilham auth context, router config e componentes base. Ordem sequencial preferida, exceto instalação de deps + shadcn init que podem preceder tudo.

### T1.W3.1 — Instalar deps + shadcn init 🤖

**Depende de:** T1.W1.3 aprovado.

**Passos:**
1. `cd frontend && npm install @sentry/react react-hook-form @hookform/resolvers zod zustand sonner`.
2. `npx shadcn@latest init` — aceitar defaults, confirmar Tailwind v4 + alias `@/components`.
3. `npx shadcn@latest add button input label form card alert skeleton`.
4. Validar que `npm run build` e `npm test` continuam passando.
5. Validar em container: `docker compose -f docker-compose.dev.yml up -d --build frontend` → `curl :3000/` 200.
6. Commit: `chore(frontend): install auth deps and init shadcn/ui (T1.W3.1)`.

**Verificação:** `npm run build` verde, `npm test` verde, stack healthy.

**Risco:** M (shadcn 2.x + Tailwind v4 — validar compatibilidade antes).

**Tempo:** M.

---

### T1.W3.2 — Auth store + API client + AuthProvider 🤖

**Depende de:** T1.W3.1.

**Passos:**
1. `src/lib/auth/store.ts` — Zustand store com `{user, status, setUser, setStatus, reset}`.
2. `src/lib/auth/schemas.ts` — Zod schemas para `LoginForm`, `ForgotForm`, `ResetForm`.
3. `src/lib/api/auth.ts` — wrappers tipados:
   ```ts
   export const api = {
     auth: {
       me: () => apiClient.get<Me>("/api/v1/auth/me").then(r => r.data),
       login: (data: LoginForm) => apiClient.post("/api/v1/auth/login", data).then(r => r.data),
       logout: () => apiClient.post("/api/v1/auth/logout"),
       forgot: (email: string) => apiClient.post("/api/v1/auth/forgot", { email }),
       reset: (access_token: string, password: string) =>
         apiClient.post("/api/v1/auth/reset", { access_token, password }),
     },
   };
   ```
4. `src/lib/api/client.ts` — estender com response interceptor para 401 (reset store, exceto na rota `/auth/me`).
5. `src/components/auth/AuthProvider.tsx` — effect hydrates store via `api.auth.me()` no boot.
6. Wrapping em `App.tsx`.
7. Commit: `feat(frontend): auth store, api client and provider (T1.W3.2)`.

**Verificação:** `npm test` passa (os testes existentes ainda rodam) + novo teste unit `store.test.ts` cobrindo reset on 401.

**Risco:** B.

**Tempo:** M.

---

### T1.W3.3 — Páginas `/login`, `/forgot-password`, `/reset-password` 🤖

**Depende de:** T1.W3.2.

**Passos:**
1. `pages/LoginPage.tsx`:
   - `useForm<LoginForm>({ resolver: zodResolver(loginSchema) })`
   - Submit → `api.auth.login(data)` → `store.setUser(resp.user) + status='authenticated'` → `navigate(state?.from?.pathname ?? "/")`.
   - Erros: 401 mostra toast "credenciais inválidas", 429 mostra "muitas tentativas, tente em X minutos".
2. `pages/ForgotPasswordPage.tsx`: form email → `api.auth.forgot(email)` → toast "se o e-mail estiver cadastrado, você receberá instruções" (não enumera).
3. `pages/ResetPasswordPage.tsx`:
   - Lê `access_token` do `location.hash` (fragmento da URL do email Supabase, formato `#access_token=...&refresh_token=...&type=recovery`).
   - Form com `password` + `confirm_password` validado por Zod.
   - Submit → `api.auth.reset(access_token, password)` → redirect para `/login` com toast sucesso.
4. Componentes shadcn reusados: `Card`, `Input`, `Label`, `Button`, `Form`, `Alert`.
5. Commit: `feat(frontend): login, forgot, reset pages (T1.W3.3)`.

**Verificação:** navegação manual contra backend local + admin bootstrapped confirma fluxo completo.

**Risco:** M.

**Tempo:** L.

---

### T1.W3.4 — `RequireAuth` guard + router config 🤖

**Depende de:** T1.W3.3.

**Passos:**
1. `src/components/auth/RequireAuth.tsx` conforme SPEC §3.9.
2. `src/routes.tsx` estendido:
   ```tsx
   createBrowserRouter([
     { path: "/login", element: <LoginPage /> },
     { path: "/forgot-password", element: <ForgotPasswordPage /> },
     { path: "/reset-password", element: <ResetPasswordPage /> },
     {
       element: <RequireAuth><Outlet /></RequireAuth>,
       children: [
         { path: "/", element: <HealthPage /> },
         // Futuras rotas protegidas entram aqui
       ],
     },
   ])
   ```
3. Commit: `feat(frontend): require auth guard and protected routes (T1.W3.4)`.

**Verificação:** acessar `/` sem cookie → redirect para `/login`.

**Risco:** B.

**Tempo:** S.

---

### T1.W3.5 — Sentry React init 🤖

**Depende de:** T1.W3.1.

**Passos:**
1. `src/lib/sentry.ts`:
   ```ts
   export function initSentry(): void {
     const dsn = import.meta.env.VITE_SENTRY_DSN;
     if (!dsn) return;
     Sentry.init({
       dsn,
       integrations: [Sentry.browserTracingIntegration()],
       tracesSampleRate: 0.1,
       environment: import.meta.env.MODE,
     });
   }
   ```
2. Chamar `initSentry()` no topo de `main.tsx`.
3. `frontend/Dockerfile` ganha `ARG VITE_SENTRY_DSN` passado via `--build-arg` quando presente.
4. Commit: `feat(frontend): sentry sdk init (T1.W3.5)`.

**Verificação:** `npm run build` sem warnings; bundle contém `@sentry/browser`.

**Risco:** B.

**Tempo:** S.

---

## Wave 4 — Testes, validação e gates humanos

### T1.W4.1 — Backend pytest suite 🤖

**Depende de:** W2 concluída.

**Passos:**
1. `tests/conftest.py` com fixtures: `settings` (override), `app_test`, `async_client`, `respx_mock`, `jwt_factory`, `fake_redis`, `db_session` (aiosqlite).
2. `test_auth_login.py` — happy, invalid, 500 upstream.
3. `test_auth_me.py` — sessão válida, sem cookie, cookie inválido.
4. `test_auth_refresh.py` — auto-refresh, refresh expirado, rotation.
5. `test_auth_logout.py` — 204 + cookies cleared + gotrue called.
6. `test_auth_forgot_reset.py` — forgot no-enum, reset happy + senha fraca.
7. `test_jwt_validation.py` — 6 casos (happy, expired, wrong alg, wrong aud, wrong iss, missing sub).
8. `test_role_gate.py` — admin vs viewer no endpoint debug.
9. `test_rate_limit.py` — sliding window OK/blocked, lockout escalation.
10. `test_user_profiles.py` — ORM read/write/upsert.
11. `test_health.py` — inalterado, deve continuar verde.
12. Rodar: `docker compose exec backend sh -c "uv pip install --system .[dev] && python -m pytest -q"`.
13. Meta: **≥30 testes**, todos verdes, coverage das camadas auth ≥80%.
14. Commit: `test(backend): auth suite with fixtures, happy/sad paths and role gate (T1.W4.1)`.

**Verificação:** todas verdes. Se alguma falhar, voltar ao módulo correspondente de W2.

**Risco:** M (mocks de JWKS podem ser frágeis).

**Tempo:** L.

---

### T1.W4.2 — Frontend vitest suite 🤖

**Depende de:** W3 concluída.

**Passos:**
1. Instalar MSW: `npm install --save-dev msw`.
2. `src/test/mocks/handlers.ts` com handlers para `/api/v1/auth/me`, `/login`, `/logout`, `/forgot`, `/reset`.
3. `src/test/mocks/server.ts` com `setupServer`.
4. Atualizar `src/test/setup.ts` para `beforeAll(server.listen) / afterEach(server.resetHandlers) / afterAll(server.close)`.
5. Testes:
   - `LoginPage.test.tsx` — form validation, submit success redirect, 401 toast, 429 toast.
   - `RequireAuth.test.tsx` — redirect unauth, allow auth, loading spinner.
   - `AuthProvider.test.tsx` — hydrate success, hydrate 401 sets unauthenticated.
   - `client.test.ts` — interceptor 401 resets store (exceto na rota `/auth/me`).
   - `store.test.ts` — reset, setUser, transitions.
6. Rodar `npm test`.
7. Meta: **≥8 testes novos**, todos verdes.
8. Commit: `test(frontend): auth suite with msw and rtl (T1.W4.2)`.

**Verificação:** `npm test` verde.

**Risco:** M.

**Tempo:** M.

---

### T1.W4.3 — Playwright E2E 🤖

**Depende de:** W2 + W3 concluídas, admin bootstrapped em ambiente de dev local (via `bootstrap_admin.py` contra Supabase ainda sem dados reais, ou contra Supabase prod após gate T1.W4.4).

**Passos:**
1. `cd frontend && npm install --save-dev @playwright/test && npx playwright install chromium`.
2. `frontend/playwright.config.ts` com `baseURL: http://localhost:3000`, retries 0, workers 1.
3. `frontend/e2e/login.spec.ts` — navega para `/login`, preenche, submete, assert redirecionamento para `/`.
4. `frontend/e2e/auth-guard.spec.ts` — navega direto para `/` sem cookie, assert redirect `/login`.
5. `frontend/e2e/logout.spec.ts` — login + chamar logout via botão → cookies vazios.
6. Adicionar script `npm run e2e` ao `package.json`.
7. Documentar em `frontend/e2e/README.md`: como rodar, requer stack dev up, requer admin bootstrapped.
8. Commit: `test(frontend): playwright e2e for login, guard, logout (T1.W4.3)`.

**Verificação:** `docker compose up -d && npm run e2e` passa as 3 specs.

**Risco:** M.

**Tempo:** M.

---

### T1.W4.4 — 🧍 Bootstrap admin em prod ⚠

**Depende de:** T1.W2.1, T1.W2.7, T1.W4.1 verdes.

**Pré-condições:**
- Senhor fornece `SUPABASE_ACCESS_TOKEN`, confirma que `SUPABASE_SECRET_KEY` está em `backend/.env.local`.
- Senhor fornece o e-mail do primeiro admin e combina a senha inicial **fora do chat**.

**Passos:**
1. Backup do estado pré-migration: via Management API, dump de `pg_tables`, `pg_policies`, `pg_constraints` filtrados por `schemaname='public'` para `phase-1-auth-bff/snapshot/pre-user-profiles-<date>.json`.
2. Aplicar a migration `user_profiles` em prod via Management API:
   ```python
   # backend/scripts/apply_phase1_migration.py (adaptação do apply_phase0.py)
   # Modo apply: BEGIN; <migration>; COMMIT; via POST /database/query
   ```
3. Validar AC-1.11: queries de verificação da tabela, RLS, policies.
4. Rodar `bootstrap_admin.py` contra prod:
   ```
   SUPABASE_URL=... SUPABASE_SECRET_KEY=... DATABASE_URL=... \
     python -m backend.scripts.bootstrap_admin --email <admin> --role admin
   ```
5. Validar AC-1.12: rodar novamente, confirmar idempotência. `select count(*) from user_profiles` = 1.
6. Snapshot pós-apply em `snapshot/post-bootstrap-<date>.json` (sem PII: apenas `count(*)`, `role`, `created_at`, **não** email).
7. Commit: `feat(phase-1): apply user_profiles migration and bootstrap admin (T1.W4.4)`.

**Verificação:** AC-1.11 + AC-1.12 verdes via Management API queries.

**Risco:** 🔴 A — gate humano. Operação irreversível em `auth.users`.

**Tempo:** M.

---

### T1.W4.5 — 🧍 Smoke test fim-a-fim contra prod

**Depende de:** T1.W4.4 concluída.

**Passos:**
1. `docker compose -f docker-compose.dev.yml up -d` com `backend/.env.local` apontando para Supabase prod.
2. Browser real em `http://localhost:3000/login`.
3. Login com credenciais do admin bootstrapped.
4. Verificar: redirect para `/`, `HealthPage` acessível.
5. Verificar cookies no devtools: `sb_access`, `sb_refresh` httpOnly, Secure? (não, local é http).
6. Logout: verificar cookies limpos, redirect para `/login`.
7. Navegar direto para `/` sem cookies (após logout): redirect.
8. Tentativa de login com senha errada 6x: 429 no 6º.
9. Registrar timeline + screenshots (sem PII) em `phase-1-auth-bff/snapshot/smoke-test-<date>.md`.
10. Commit: `docs(phase-1): e2e smoke test evidence (T1.W4.5)`.

**Verificação:** todos os passos passam.

**Risco:** M — gate humano.

**Tempo:** M.

---

## Wave 5 — Finalização

### T1.W5.1 — `CHECKPOINT.md` 🤖

**Passos:**
1. Criar `phase-1-auth-bff/CHECKPOINT.md` com:
   - Status: DONE
   - Timeline (início, fim, durações por wave)
   - Tabela dos 12+ commits da fase
   - Mapa dos 16 ACs × evidência (linhas apontando para queries, testes, snapshots)
   - Decisões tomadas durante a execução (ajustes ao SPEC)
   - Risk register executado (quais riscos se manifestaram, quais foram mitigados)
   - Chaves pós-fase (inalteradas vs Fase 0)
   - Backlog carregado para fases futuras
2. Mesmo molde do `phase-0-security-baseline/CHECKPOINT.md`.

**Tempo:** M.

---

### T1.W5.2 — `mem_save` + auto-memory update 🤖

**Passos:**
1. `mcp__jarvis-memory__mem_save` com:
   - `topic_key`: `dashboard-cartorio-paulista-phase-1-complete`
   - `type`: `session_summary`
   - `tags`: `phase-1`, `auth`, `bff`, `supabase`, `fastapi`, `jwt`, `rate-limit`, `complete`
   - `content`: resumo executivo (commits, ACs, decisões-chave, estado pós-fase).
2. Atualizar `memory/project_phase_status.md` marcando Fase 1 DONE + Fase 2 ativa.
3. Atualizar `MEMORY.md` índice se necessário.

**Tempo:** S.

---

### T1.W5.3 — Prompt de abertura da Fase 2 🤖

**Passos:**
1. Criar `.planning/enterprise-rebuild/phase-2-collaborators-admin/SESSION-OPENING-PROMPT.md` seguindo `docs/session-handoff-template.md` (10 seções obrigatórias).
2. Conteúdo: escopo Fase 2 (CRUD de colaboradores + merge + aliases + audit log), pré-requisitos (Fase 1 DONE, admin bootstrapped), credenciais necessárias, comandos de abertura, interdições, deliverables.
3. Secret-scan grep antes de commitar: nenhum `eyJ...`, `sbp_`, `sb_secret_`, `sb_publishable_x[A-Za-z0-9]`.
4. Commit: `docs(phase-2): session opening prompt handoff (T1.W5.3)`.

**Tempo:** M.

---

### T1.W5.4 — Merge, tag, push 🧍 (último gate leve)

**Passos:**
1. `git checkout main && git pull --ff-only`.
2. `git merge --ff-only feat/phase-1-auth-bff` — se não for fast-forward, rebase primeiro.
3. `git tag -a v0.0.3-phase-1 -m "Phase 1 Auth & Backend BFF — done"`.
4. `git push origin main && git push origin v0.0.3-phase-1`.
5. `git branch -d feat/phase-1-auth-bff` (local) + `git push origin --delete feat/phase-1-auth-bff` (remoto, se chegou lá).
6. Smoke test final: `git log --oneline -10`, `git tag -l "v*"`.

**Gates absolutos:**
- Nunca `--force` ou `--force-with-lease`.
- Nunca `--no-verify`.
- Se push falhar por gitleaks/security-gate: **parar e investigar**.

**Tempo:** S.

---

## Ordem visual (waves + paralelismo)

```
W1  T1.W1.0 (research paralelo) → T1.W1.1 SPEC → T1.W1.2 TASKS → 🧍 T1.W1.3 approval
                                                                     │
                                                                     ▼
W2  T1.W2.0 scaffolding ──┬── T1.W2.1 [P] migration
                          ├── T1.W2.2 [P] core/security (JWKS)
                          ├── T1.W2.3 [P] services/supabase_auth
                          ├── T1.W2.4 [P] services/rate_limit
                          └── T1.W2.5 [P] deps/auth + models
                                     │
                                     ▼
                              T1.W2.6 api/v1/auth (fan-in)
                                     │
                                     ▼
                              T1.W2.7 bootstrap_admin CLI
                                     │
                                     ▼
                              T1.W2.8 Sentry + X-Request-ID + lifespan wiring
                                     │
                                     ▼
W3  T1.W3.1 deps + shadcn → T1.W3.2 store + client + provider
        → T1.W3.3 pages → T1.W3.4 router guard → T1.W3.5 Sentry
                                     │
                                     ▼
W4  T1.W4.1 backend tests ┬ T1.W4.2 frontend tests ┬ T1.W4.3 e2e
                          │                         │
                          └──────── todos verdes ───┘
                                     │
                                     ▼
                          🧍 T1.W4.4 bootstrap admin prod
                                     │
                                     ▼
                          🧍 T1.W4.5 smoke test prod
                                     │
                                     ▼
W5  T1.W5.1 CHECKPOINT → T1.W5.2 mem_save → T1.W5.3 prompt Fase 2 → T1.W5.4 merge+tag+push
```

**Gates humanos:** T1.W1.3, T1.W4.4, T1.W4.5, T1.W5.4 (leve — confirmação antes do push final).

---

## Definição de "Done"

- [ ] Todos os 16 ACs da SPEC passam (unit, integration, e2e e prod).
- [ ] Migration `user_profiles` aplicada em prod via Management API.
- [ ] Primeiro admin bootstrapped em prod; idempotência verificada.
- [ ] Suítes pytest (backend), vitest (frontend), Playwright (e2e) todas verdes.
- [ ] Sentry inicializado (backend e frontend, opt-in).
- [ ] Rate limit Redis testado e bloqueando.
- [ ] Stack `docker compose dev` continua healthy.
- [ ] `phase-1-auth-bff/CHECKPOINT.md` marcado DONE com mapa de ACs.
- [ ] `phase-1-auth-bff/snapshot/pre-user-profiles-<date>.json` existe.
- [ ] `phase-1-auth-bff/snapshot/post-bootstrap-<date>.json` existe (sem PII).
- [ ] `phase-1-auth-bff/snapshot/smoke-test-<date>.md` existe.
- [ ] `mem_save` registrado (session_summary Fase 1).
- [ ] `memory/project_phase_status.md` atualizado.
- [ ] `.planning/enterprise-rebuild/phase-2-collaborators-admin/SESSION-OPENING-PROMPT.md` redigido.
- [ ] Branch `feat/phase-1-auth-bff` mergeada fast-forward em `main`.
- [ ] Tag `v0.0.3-phase-1` em `origin/main`.
- [ ] Nenhum segredo em commit, snapshot, CHECKPOINT ou documento de planejamento.
- [ ] Senhor aprovou o encerramento da fase.
