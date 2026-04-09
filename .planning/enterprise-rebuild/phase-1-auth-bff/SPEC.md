# SPEC — Phase 1: Auth & Backend BFF

> Spec-level: brownfield. Primeira fase que entrega caminho real de acesso a dados — autenticado, com cookie httpOnly emitido pelo backend FastAPI, validação local de JWT via JWKS, e role gate. Template SDD.
>
> **Pré-requisito:** Fase 0 (Security Baseline) concluída em 2026-04-09 (`v0.0.2-phase-0`). RLS default-deny enforçada em todas as tabelas `public`. As 4 chaves antigas retornam HTTP 401; as novas `sb_*` retornam HTTP 200. Backend e frontend ainda em modo "hello world" (`/health` apenas).

---

## 0. Metadata

- **Fase:** 1
- **Depende de:** Fase 0 aplicada em prod e mergeada em `main`.
- **Bloqueia:** Fase 2 (Collaborators Admin Panel), Fase 3 (Visualization Refactor), Fase 4 (Scraper Rebuild).
- **Status:** ready — todas as decisões D1/D2/D3 já estão resolvidas em `DESIGN-DISCUSSION.md`. Decisões adicionais (libs, JWT lib, cookie strategy, role lookup) são tomadas neste SPEC.
- **Proprietário:** JARVIS + Senhor (gates humanos em T1.W1.3, T1.W4.4, T1.W4.5).
- **Release alvo:** `v0.0.3-phase-1`.

---

## 1. Objetivo

Construir o BFF de autenticação que substitui a fala direta browser↔Supabase, fechando o **caminho real** entre o usuário e os dados:

1. **Backend FastAPI relay para Supabase Auth.** Rotas `/api/v1/auth/{login,logout,me,refresh,forgot,reset}` chamam o gotrue (`https://<ref>.supabase.co/auth/v1/*`) via `httpx.AsyncClient` com a `sb_secret_*` no header `apikey`. O frontend nunca vê tokens Supabase.
2. **Sessão via cookie httpOnly.** Backend emite dois cookies: `sb_access` (TTL 1h) e `sb_refresh` (TTL 7d), `Secure`, `SameSite=Lax`, `HttpOnly`. Refresh automático via dependency quando o `access` expira.
3. **Validação local de JWT via JWKS.** Middleware/dependency lê o `sb_access`, valida assinatura assimétrica (RS256/ES256) usando o JWKS público (`/.well-known/jwks.json`), valida `iss`/`aud`/`exp`/`sub`, popula `request.state.user`.
4. **Tabela `user_profiles` + role-based access.** Migration adicional cria `public.user_profiles (user_id, role, created_at, updated_at, disabled_at)` com `role ∈ {admin, manager, viewer}`. RLS default-deny RESTRICTIVE (mantém o padrão Phase 0). Backend lê o role via `service_role` (bypassa RLS). Dependencies `require_authenticated`, `require_role('admin'|'manager'|'viewer')`.
5. **Bootstrap do primeiro admin via CLI.** Script `backend/scripts/bootstrap_admin.py` cria usuário em `auth.users` (via `POST /auth/v1/admin/users`) e linha em `user_profiles` com `role='admin'`. Operação idempotente. Sem UI nesta fase.
6. **Rate limiting Redis em endpoints de auth.** Sliding window 5 tentativas por 15 min por `(email, ip)`. Lockout escalonado (15min → 1h → 24h) ao 6º miss persistente.
7. **Frontend SPA com fluxo completo de auth.** Páginas `/login`, `/forgot-password`, `/reset-password`. Auth context (Zustand) hidratado por `GET /api/v1/auth/me` no boot. `<RequireAuth>` guard redireciona rotas protegidas para `/login`. Axios interceptor trata 401 globalmente.
8. **Sentry SDK no backend e frontend.** Inicialização opt-in via env var (`SENTRY_DSN` / `VITE_SENTRY_DSN`). Capture inicial sem PII.
9. **Suítes de teste verdes.** pytest backend (auth happy path, sad path, role gate, rate limit, JWT validation), vitest frontend (form validation, redirect on 401, auth context), Playwright E2E (login, logout, auth guard, role gate).

**Não faz parte desta fase:**
- CRUD de colaboradores e merge (Fase 2).
- Páginas `/dashboard`, `/reviews`, `/analytics` (Fase 3).
- Reescrita do scraper, novas tasks arq (Fase 4).
- MFA TOTP, account lockout permanente, password complexity rules além do default Supabase (Fase 5 ou backlog).
- Multi-tenant real (Artigo IX).
- Deploy em Railway prod (acontece quando o Senhor decidir, possivelmente entre Fase 1 e 2).

---

## 2. Comportamento Atual (validado em 2026-04-09)

| # | Componente | Estado |
|---|---|---|
| 1 | `backend/` | FastAPI scaffolding hello-world. Apenas `GET /health` e `GET /api/v1/health` (200). Settings em `app/core/config.py` carrega `env`, `database_url`, `supabase_url`, `supabase_service_role_key`, `redis_url`, `cors_origins`, `sentry_dsn`, `log_level`. Lifespan + structlog + CORS já configurados. 0 endpoints de negócio. 2 testes pytest (health) verdes. |
| 2 | `frontend/` | Vite 6 + React 19 + TS 5 + Tailwind v4. Única rota `/` → `HealthPage` que faz `fetch` direto ao backend `/health`. `axios` instalado em `lib/api/client.ts` com `withCredentials: true` mas não usado ainda. 1 teste vitest verde. Sem auth, sem store, sem guard. |
| 3 | `workers/` | arq scaffolding. `/health` na porta 9000. Não tocado nesta fase. |
| 4 | `supabase/migrations/` | 5 arquivos da Fase 0 aplicados em prod. Nenhuma referência a `user_profiles` ou `auth.users` no repo (exceto docs de planejamento). |
| 5 | Stack dev | `docker compose -f docker-compose.dev.yml up -d` sobe os 4 serviços healthy; `curl :8000/health`, `:8000/api/v1/health`, `:9000/health`, `:3000/` retornam 200; `redis-cli ping` → PONG; backend pytest 2/2; workers pytest 1/1. **Validado em 2026-04-09 com a stack atual de Fase 0.** |
| 6 | Supabase Auth (gotrue) | Disponível em `https://bugpetfkyoraidyxmzxu.supabase.co/auth/v1/*`. JWKS público em `/auth/v1/.well-known/jwks.json`. Aceita `sb_publishable_*` e `sb_secret_*` no header `apikey`. **Restrição confirmada via research:** as novas chaves `sb_*` **não** podem ser colocadas no header `Authorization` — só no `apikey`. O `Authorization: Bearer <jwt>` fica reservado para o JWT do usuário. |
| 7 | Pyproject backend | Já contém **todas** as deps de runtime que a Fase 1 precisa: `fastapi`, `uvicorn`, `pydantic-settings`, `sqlalchemy[asyncio]`, `asyncpg`, `httpx`, `python-jose[cryptography]`, `python-multipart`, `redis`, `sentry-sdk[fastapi]`, `structlog`. Adições propostas: **`pyjwt[crypto]>=2.9`** (justificada em §3.4). |
| 8 | Package.json frontend | Faltam: `@sentry/react`, `react-hook-form`, `zod`, `zustand`, `sonner`, `@hookform/resolvers`. shadcn/ui ainda não inicializado (mas `tailwind-merge`, `clsx`, `class-variance-authority`, `lucide-react` já presentes — base pronta). |

---

## 3. Comportamento Alvo

### 3.1 Estrutura backend

```
backend/app/
├── api/v1/
│   ├── health.py                # já existe
│   └── auth.py                  # NOVO — login/logout/me/refresh/forgot/reset
├── core/
│   ├── config.py                # estende com chaves de auth (§3.2)
│   ├── logging.py               # já existe
│   └── security.py              # NOVO — JWKS client, JWT decode, claims model
├── db/
│   ├── session.py               # já existe (SQLAlchemy async engine)
│   └── models/
│       ├── __init__.py          # NOVO
│       └── user_profile.py      # NOVO — ORM model
├── deps/
│   ├── __init__.py
│   ├── auth.py                  # NOVO — get_current_user, require_role, get_redis
│   └── db.py                    # NOVO — async session injector
├── schemas/
│   ├── __init__.py              # NOVO
│   └── auth.py                  # NOVO — Pydantic v2 request/response
├── services/
│   ├── __init__.py              # NOVO
│   ├── supabase_auth.py         # NOVO — httpx wrapper de gotrue
│   └── rate_limit.py            # NOVO — sorted-set sliding window via redis
└── main.py                      # router include + Sentry init + middleware

backend/scripts/
├── apply_phase0.py              # já existe
├── export_schema.py             # já existe
└── bootstrap_admin.py           # NOVO — CLI idempotente

backend/tests/
├── conftest.py                  # NOVO — fixtures (httpx mock, JWKS mock, redis fake, db)
├── test_health.py               # já existe
├── test_auth_login.py           # NOVO
├── test_auth_me.py              # NOVO
├── test_auth_refresh.py         # NOVO
├── test_auth_logout.py          # NOVO
├── test_auth_forgot_reset.py    # NOVO
├── test_jwt_validation.py       # NOVO
├── test_role_gate.py            # NOVO
├── test_rate_limit.py           # NOVO
└── test_user_profiles.py        # NOVO
```

### 3.2 Settings adicionais

`app/core/config.py` ganha (todos com defaults seguros para local; valores reais via `.env.local` + Railway):

```python
# Supabase Auth
supabase_publishable_key: str = ""              # sb_publishable_*  (frontend não usa)
supabase_jwks_url: str = ""                     # default derivado de supabase_url se vazio
supabase_jwt_audience: str = "authenticated"
supabase_jwt_issuer: str = ""                   # default derivado de supabase_url
supabase_jwt_algorithms: list[str] = ["RS256", "ES256"]

# Cookies
cookie_access_name: str = "sb_access"
cookie_refresh_name: str = "sb_refresh"
cookie_access_max_age: int = 3600               # 1h, alinhado com gotrue default
cookie_refresh_max_age: int = 60 * 60 * 24 * 7  # 7d
cookie_secure: bool = False                     # True em prod (env var)
cookie_samesite: str = "lax"
cookie_domain: str | None = None
cookie_path: str = "/"
cookie_refresh_path: str = "/api/v1/auth/refresh"  # path scoping defensivo

# Rate limit
auth_rate_limit_attempts: int = 5
auth_rate_limit_window_seconds: int = 900       # 15 min
auth_lockout_steps_seconds: list[int] = [900, 3600, 86400]  # 15min, 1h, 24h
```

Nenhum segredo é colocado no SPEC. Valores reais vivem em `backend/.env.local` (gitignored) e em Railway env vars.

### 3.3 Decisão D1.1 — Cliente Supabase Auth: `httpx` direto

**Decisão:** **NÃO** instalar `supabase-auth` (a lib renomeada de `gotrue-py`). Implementar o relay diretamente em `services/supabase_auth.py` usando `httpx.AsyncClient`.

**Justificativas (factuais):**

- A `supabase-auth` é um port do client JS, projetada para SPAs com session storage e refresh interno. Para um BFF stateless ela é overhead — descartamos a maioria das suas abstrações de "current session".
- Ela pina `httpx>=0.26,<0.29`, e o backend já tem `httpx>=0.27` declarado. Compatível, mas adicionar a lib introduz uma constraint extra que pode atrapalhar bumps futuros do httpx.
- Cobertura 1:1 dos endpoints gotrue: a `supabase-auth` lança releases atrás dos novos endpoints admin (auditado em 2026-03 por research). Ir direto via `httpx` garante paridade imediata com qualquer rota nova.
- Modelo de erro: trocar o tratamento `AuthApiError` por `httpx.HTTPStatusError` é trivial e mais consistente com o resto do backend.
- Controle fino sobre o header `apikey` (que **não pode** ser passado em `Authorization` para as chaves `sb_*`).

**Surface mínima de `services/supabase_auth.py`:**

```python
class SupabaseAuthClient:
    def __init__(self, base_url: str, secret_key: str, http: httpx.AsyncClient): ...

    async def sign_in_with_password(self, email: str, password: str) -> TokenResponse: ...
    async def refresh_session(self, refresh_token: str) -> TokenResponse: ...
    async def get_user(self, access_token: str) -> SupabaseUser: ...
    async def sign_out(self, access_token: str, scope: Literal["local","global"]="local") -> None: ...
    async def recover_password(self, email: str) -> None: ...
    async def update_user_password(self, access_token: str, new_password: str) -> SupabaseUser: ...
    async def admin_create_user(self, email: str, password: str, *, email_confirm: bool=True,
                                app_metadata: dict[str, Any] | None=None) -> SupabaseUser: ...
```

Uma instância única do cliente vive no `app.state.supabase_auth`, criada no `lifespan`, reusando o `httpx.AsyncClient` do app.

### 3.4 Decisão D1.2 — Validação JWT: `pyjwt[crypto]` + cache JWKS local

**Decisão:** adicionar **`pyjwt[crypto]>=2.9`** ao `pyproject.toml` e usar `PyJWKClient` para fetch+cache do JWKS, com guard de stampede via `asyncio.Lock`. **Não remover** `python-jose` ainda (não é usado em lugar nenhum, removível em cleanup futuro).

**Justificativas (factuais):**

- `python-jose` não tem helper assíncrono nem cliente JWKS — exigiria reimplementar fetch + cache + invalidação.
- `PyJWKClient` traz cache em memória embutido (TTL 300s default, configurável via `lifespan`), busca por `kid`, e reuso em rotação de chaves (Supabase usa rotation Standby → Current → Previously Used → Revoked).
- O fetch interno do `PyJWKClient` é síncrono (`urllib`); para um servidor async, envolvemos a primeira chamada em `asyncio.to_thread` ou warm no startup. Ambos triviais.
- Stampede protection: módulo singleton com `asyncio.Lock` envolve a refresh; convergência conhecida na comunidade FastAPI.

**Claims validadas pela `core/security.verify_access_token(token)`:**

| Claim | Validação |
|---|---|
| `signature` | via JWKS público (kid lookup) |
| `alg` | allow-list explícita: `["RS256", "ES256"]` (HS256 é legacy Supabase, projeto novo usa asymmetric) |
| `iss` | exact match contra `settings.supabase_jwt_issuer` |
| `aud` | exact match contra `"authenticated"` (rejeita `"anon"`) |
| `exp` | dentro de leeway 5s (clock skew) |
| `sub` | presente, parseável como UUID |

**Source of truth de role:** `app_metadata.role` no JWT é **ignorado**. O backend lê `user_profiles.role` do Postgres via `service_role` em cada request autenticada (cacheado em `request.state.user` para o ciclo da request). Razão: o role é gerenciado por nós (via `bootstrap_admin` e, futuramente, admin panel da Fase 2), não pelo Supabase. Replicar para `app_metadata` adicionaria sincronização frágil entre dois sistemas. O custo de uma query extra por request é desprezível (PK lookup em tabela com poucas dezenas de linhas).

### 3.5 Endpoints

| Método | Caminho | Auth | Body | Resposta sucesso | Erros |
|---|---|---|---|---|---|
| `POST` | `/api/v1/auth/login` | público | `{email, password}` | `200` `{user: {id, email, role}, expires_at}` + Set-Cookie `sb_access`, `sb_refresh` | `400` validação, `401` credencial inválida, `429` rate-limited, `503` upstream gotrue down |
| `POST` | `/api/v1/auth/logout` | autenticado | — | `204` + cookies expirados | `401` sem sessão (idempotente, retorna 204 mesmo assim) |
| `GET` | `/api/v1/auth/me` | autenticado | — | `200` `{id, email, role, created_at, app_metadata}` | `401` sem sessão / token inválido / refresh falhou |
| `POST` | `/api/v1/auth/refresh` | refresh cookie | — | `200` + cookies rotacionados | `401` refresh inválido/expirado |
| `POST` | `/api/v1/auth/forgot` | público | `{email}` | `200` `{}` (resposta intencionalmente vazia, sem enumeração) | `400` validação, `429` rate-limited |
| `POST` | `/api/v1/auth/reset` | público (carrega recovery token) | `{access_token, password}` | `200` `{user}` | `400` token inválido / senha fraca, `401` token expirado |

**Notas:**
- `login` e `forgot` consomem o rate limiter (chave `(email, ip)`).
- `logout` chama `POST /auth/v1/logout?scope=local` no gotrue antes de limpar os cookies; se o upstream falhar, ainda assim limpa os cookies localmente (best-effort revoke).
- `refresh` é exposto como endpoint próprio para o frontend chamar manualmente em casos de retomada de sessão; o middleware **também** auto-refresha quando uma request autenticada chega com `sb_access` expirado mas `sb_refresh` válido.
- `reset` espera o `access_token` que vem na URL do email de recovery (Supabase entrega via fragmento `#access_token=...`). O frontend extrai do hash e POST para o backend. O backend usa `PUT /auth/v1/user` com esse access token como `Authorization: Bearer`.
- Todos os endpoints retornam JSON (não form-data); `python-multipart` permanece instalado por compatibilidade futura.

### 3.6 Migration `user_profiles`

Arquivo: `supabase/migrations/<timestamp>_user_profiles.sql`. Timestamp será gerado no momento da criação (T1.W2.1), posterior aos 5 da Fase 0.

```sql
-- user_profiles, JARVIS, 2026-xx-xx, references SPEC §3.6
-- Creates the application-side user role table that the BFF reads
-- to authorize requests. Mirrors auth.users 1:1 via FK on delete cascade.
-- RLS lockdown is RESTRICTIVE deny_all (matches Phase 0 baseline).
-- Backend uses service_role to bypass RLS; no PERMISSIVE policies needed.

create table public.user_profiles (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  role        text        not null check (role in ('admin','manager','viewer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  disabled_at timestamptz
);

create index user_profiles_role_idx
  on public.user_profiles (role)
  where disabled_at is null;

-- updated_at maintenance via trigger
create or replace function public.user_profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row
  execute function public.user_profiles_set_updated_at();

-- RLS lockdown matching Phase 0 baseline
alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;

create policy user_profiles_deny_all
  on public.user_profiles
  as restrictive
  using (false);

revoke all on public.user_profiles from anon, authenticated, public;
revoke execute on function public.user_profiles_set_updated_at() from anon, authenticated, public;

comment on table public.user_profiles is
  'BFF-side role assignment for users in auth.users. Read by backend via service_role only.';
```

**Observação importante sobre RLS** (corrigindo a sugestão informal do prompt de abertura):

Phase 0 instalou uma policy RESTRICTIVE `<table>_deny_all` em todas as tabelas `public`. Policies RESTRICTIVE são combinadas com **AND** sobre as PERMISSIVE — uma policy RESTRICTIVE `using (false)` derruba **qualquer** linha, mesmo que existam PERMISSIVE policies que liberariam. Não há como "abrir um buraco para o próprio user_id" sem antes dropar o deny_all. Como o backend usa `service_role` (que nativamente bypassa RLS), **não precisamos** abrir nada. A RESTRICTIVE deny_all permanece como defesa em profundidade — se a `sb_secret_*` vazar amanhã, o atacante ainda não consegue ler `user_profiles` via PostgREST com publishable.

### 3.7 Bootstrap admin CLI

`backend/scripts/bootstrap_admin.py`:

```
$ python -m backend.scripts.bootstrap_admin --email admin@cartorio.com --role admin
Senhor will be prompted for password (no echo).
```

Comportamento:

1. Lê `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` do ambiente (mesma `.env.local` do backend).
2. Prompta a senha via `getpass.getpass`.
3. Chama `POST /auth/v1/admin/users` com `{email, password, email_confirm: true, app_metadata: {bootstrap: true}}`.
4. Se o gotrue retornar 422 "User already exists", chama `GET /auth/v1/admin/users?email=...` para recuperar o `id`.
5. `INSERT INTO public.user_profiles (user_id, role) VALUES (...) ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, disabled_at = NULL, updated_at = now()`.
6. Imprime `{user_id, email, role}` no stdout. Sai com exit code 0.

Idempotente: rodar duas vezes com os mesmos argumentos não falha; o segundo run apenas faz upsert do role.

Dry-run mode: `--dry-run` imprime o que faria sem chamar o gotrue nem o DB.

### 3.8 Rate limit Redis

`services/rate_limit.py` expõe:

```python
class RateLimiter:
    async def hit(self, key: str, *, max_attempts: int, window_seconds: int) -> RateLimitResult: ...
    async def lockout_status(self, key: str) -> LockoutState: ...
    async def record_failure(self, key: str) -> LockoutState: ...
    async def reset(self, key: str) -> None: ...
```

- **Sliding window:** sorted set por `key`, score = timestamp ms. `ZADD` + `ZREMRANGEBYSCORE` + `ZCARD`. Retorna `{allowed: bool, remaining: int, retry_after_seconds: int}`.
- **Lockout escalonado:** chave separada `auth:lockout:{email}:{ip}`. `INCR` + `EXPIRE` configura o nível 1→2→3 com janelas `[900, 3600, 86400]`. Reset em login bem-sucedido.
- **Chave do rate limit de login:** `auth:rate:login:{email_lower}:{ip}`.
- **Chave do rate limit de forgot:** `auth:rate:forgot:{email_lower}:{ip}` com janela maior (1 tentativa por 5 min) para reduzir flood de email.

Aplicado como dependency `Depends(rate_limit_login)` na rota `/login`. 6ª tentativa retorna `429` com header `Retry-After`.

### 3.9 Estrutura frontend

```
frontend/src/
├── main.tsx                     # estende com Sentry init
├── App.tsx                      # estende com AuthProvider + Sonner Toaster
├── routes.tsx                   # estende com /login, /forgot-password, /reset-password
├── pages/
│   ├── HealthPage.tsx           # já existe
│   ├── LoginPage.tsx            # NOVO
│   ├── ForgotPasswordPage.tsx   # NOVO
│   └── ResetPasswordPage.tsx    # NOVO
├── components/
│   ├── auth/
│   │   ├── AuthProvider.tsx     # NOVO — hidrata store no boot
│   │   └── RequireAuth.tsx      # NOVO — guard component
│   └── ui/                      # shadcn/ui inicializado (button, input, label, form, card, alert)
├── lib/
│   ├── api/
│   │   ├── client.ts            # estende com response interceptor 401 → store.reset
│   │   └── auth.ts              # NOVO — login(), logout(), me(), forgot(), reset()
│   ├── auth/
│   │   ├── store.ts             # NOVO — zustand store {user, status}
│   │   └── schemas.ts           # NOVO — zod schemas das forms
│   └── sentry.ts                # NOVO — init helper
└── test/
    └── setup.ts                 # já existe
```

**AuthProvider:**

```tsx
export function AuthProvider({ children }: { children: ReactNode }) {
  const setUser = useAuthStore(s => s.setUser);
  const setStatus = useAuthStore(s => s.setStatus);

  useEffect(() => {
    setStatus("loading");
    api.auth.me()
      .then(user => { setUser(user); setStatus("authenticated"); })
      .catch(() => { setUser(null); setStatus("unauthenticated"); });
  }, [setUser, setStatus]);

  return <>{children}</>;
}
```

**RequireAuth:**

```tsx
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore(s => s.status);
  const location = useLocation();

  if (status === "loading") return <FullPageSpinner />;
  if (status !== "authenticated") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
```

**Axios interceptor (lib/api/client.ts):**

```ts
apiClient.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Avoid loop on /auth/me (which is the probe itself)
      const url = error.config?.url ?? "";
      if (!url.endsWith("/auth/me")) {
        useAuthStore.getState().reset();
      }
    }
    return Promise.reject(error);
  }
);
```

### 3.10 Sentry

- **Backend:** `sentry_sdk.init(dsn=settings.sentry_dsn, integrations=[FastApiIntegration(transaction_style="endpoint")], traces_sample_rate=0.1)` chamado antes do `app = FastAPI(...)` quando `settings.sentry_dsn` é não-vazio. PII desabilitado por default (`send_default_pii=False`).
- **Frontend:** `Sentry.init({dsn: import.meta.env.VITE_SENTRY_DSN, integrations: [browserTracingIntegration()], tracesSampleRate: 0.1})` em `main.tsx` quando o DSN está presente.
- Smoke test: opcionalmente uma rota debug-only `GET /api/v1/_debug/sentry` que faz `raise RuntimeError("sentry smoke test")`, gateada por `settings.env != "production"`.

### 3.11 Testes

**Backend pytest** (com fixtures em `conftest.py`):

- `respx_mock`: intercepta chamadas httpx para o gotrue (cobre login/refresh/forgot/reset/admin).
- `jwt_factory`: gera JWTs HS256 ou RS256 assinados com chave de teste, devolve token e patch do JWKS no `core.security`.
- `redis_fake`: `fakeredis.aioredis` para o rate limiter.
- `db_session`: sqlite-in-memory ou container Postgres efêmero (a definir na T1.W4.1; preferência: container reusando o redis dev container? não — usar `aiosqlite` para velocidade nos unit tests, container Postgres só nos integration).
- `client`: `httpx.AsyncClient(transport=ASGITransport(app=app))`.

**Frontend vitest:** MSW para mockar `/api/v1/auth/*`. RTL para render. Cobertura de:
- Form validation (zod errors visíveis).
- Submit success → cookies setados (verificar via mock + redirect).
- 401 global → reset store + navigate.
- AuthProvider hidrata via `/auth/me` mock.
- RequireAuth redireciona quando `unauthenticated`.

**E2E Playwright:** instalação na T1.W4.3. Cobre:
- Login flow real contra backend real (stack docker compose dev) usando o admin bootstrapped no env de dev.
- Acesso a uma rota protegida sem cookie → redirect.
- Logout → cookies limpos → redirect.

---

## 4. Invariantes

1. **Article II — Zero Trust no Frontend.** O frontend nunca recebe nem envia tokens Supabase. Qualquer log de cookie/token no console é regressão.
2. **`service_role` exclusivamente server-side.** A chave `sb_secret_*` aparece em `backend/.env.local` (gitignored) e em Railway env vars. Nunca em `frontend/`, nem em commit, nem em log estruturado.
3. **Cookies httpOnly Secure.** `cookie_secure=True` é mandatório em produção (env var `COOKIE_SECURE=true` no Railway). Local pode `False` para http://localhost.
4. **JWT validado localmente.** Nenhum endpoint chama `/auth/v1/user` para "verificar" o token — verificação é por JWKS no processo. Single round-trip ao Supabase apenas em login/refresh/logout/forgot/reset.
5. **`user_profiles.role` é a única source of truth de role.** Não sincronizar para `app_metadata` nesta fase.
6. **RLS deny_all permanece.** Migration `user_profiles` adiciona a tabela com a mesma RESTRICTIVE policy do baseline Phase 0. Backend bypassa via `service_role`.
7. **Nenhuma migração da Fase 0 é tocada.** Os 5 arquivos em `supabase/migrations/2026040912*.sql` são read-only.
8. **Idempotência do bootstrap.** Rodar `bootstrap_admin.py` duas vezes com os mesmos argumentos é seguro.
9. **Rate limit não bloqueia o admin gate.** Lockout aplica a `(email, ip)`, não a admin global. Senhor que esquece a senha localmente deve poder usar `forgot` mesmo após lockout — `forgot` tem rate limit próprio, separado.
10. **Sentry opt-in.** Ausência de DSN não derruba a aplicação. `init` é guarded.
11. **Coleta continua parada.** Esta fase **não** mexe no scraper, no `auto-collector`, nem reativa nada — fica para Fase 4.
12. **Stack dev continua subindo limpa.** `docker compose up` deve continuar passando todos os healthchecks após Fase 1.

---

## 5. Limites de Escopo

### In
- Backend FastAPI: novos módulos em `api/v1/auth.py`, `core/security.py`, `services/supabase_auth.py`, `services/rate_limit.py`, `deps/auth.py`, `deps/db.py`, `schemas/auth.py`, `db/models/user_profile.py`.
- Migration `<timestamp>_user_profiles.sql`.
- Script CLI `bootstrap_admin.py`.
- Frontend: páginas auth, AuthProvider, RequireAuth, axios interceptor, store Zustand, schemas Zod, shadcn/ui init, Sentry init.
- Suítes pytest, vitest e Playwright para o fluxo de auth.
- Sentry SDK Python e JS.
- Atualização de `frontend/package.json` e `backend/pyproject.toml`.
- Aplicação da migration `user_profiles` em prod.
- Bootstrap do primeiro admin em prod.

### Out
- CRUD/admin de colaboradores (Fase 2).
- Páginas `/dashboard`, `/reviews`, `/analytics`, `/trends` (Fase 3).
- Tasks arq, novo scraper, cron jobs (Fase 4).
- Runbooks operacionais detalhados, load test, backup pipeline (Fase 5).
- MFA TOTP completo, password complexity rules custom, social login.
- Multi-tenant.
- Deploy para Railway (acontece em sessão separada quando o Senhor decidir).
- E2E em CI (a infra de CI ganha esse job na Fase 5; nesta fase os E2E rodam local).

---

## 6. Stack / Padrões

- **Backend Python 3.12 + FastAPI ≥0.115.** Padrão Router → Service → Model.
- **`httpx.AsyncClient`** para gotrue (instância única no `app.state`).
- **`pyjwt[crypto]>=2.9`** para JWT validation. Adicionado a `pyproject.toml`. `python-jose` permanece declarado mas não usado (cleanup futuro).
- **`fakeredis>=2.24`** adicionado a `[project.optional-dependencies].dev` para testes do rate limiter.
- **`respx>=0.21`** adicionado a dev deps para mock de httpx nos testes do supabase_auth client.
- **`pytest-mock>=3.14`** se necessário (avaliar; provavelmente respx + monkeypatch bastam).
- **`aiosqlite>=0.20`** dev dep para in-memory test DB nos unit tests (integration tests ainda usam o Supabase staging via env var).
- **Frontend Vite 6 + React 19.** TanStack Query usado para queries futuras; auth state em Zustand para simplicidade.
- **`zod>=3.23`**, **`react-hook-form>=7.53`**, **`@hookform/resolvers>=3.9`**, **`zustand>=5.0`**, **`sonner>=1.5`**, **`@sentry/react>=8.30`** adicionados a `package.json`.
- **shadcn/ui** inicializado via `npx shadcn@latest init` com o config padrão (Tailwind v4, alias `@/components`). Componentes usados: `button`, `input`, `label`, `form`, `card`, `alert`, `skeleton`.
- **Convenções de migration:** mesmo padrão da Fase 0 — header com nome/autor/data/SPEC ref, idempotência onde viável, transação implícita.
- **Convenções Python:** PEP 8, ruff isort style, mypy strict, `from __future__ import annotations`.
- **Convenções TS:** strict, `noUncheckedIndexedAccess` ligado, alias `@/*`.
- **Logs:** structlog JSON com correlation ID `X-Request-ID` (introduzido nesta fase como middleware leve).

---

## 7. Verificação / Critérios de Aceitação

Given/When/Then obrigatórios. **16 ACs.** Os ACs com sufixo `(prod)` exigem rodar contra Supabase prod via gate humano (T1.W4.4/T1.W4.5).

### AC-1.1 — Login happy path
- **Given** stack dev rodando, `bootstrap_admin.py` já criou `admin@dev.local` com role `admin` em ambiente local conectado a Supabase prod (ou staging definido), rate limit Redis vazio.
- **When** `POST http://localhost:8000/api/v1/auth/login` com body `{"email":"admin@dev.local","password":"<senha>"}`.
- **Then** HTTP 200, body `{"user":{"id":"<uuid>","email":"admin@dev.local","role":"admin"}}`, resposta inclui `Set-Cookie: sb_access=...; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600` e `Set-Cookie: sb_refresh=...; HttpOnly; Path=/api/v1/auth/refresh; SameSite=Lax; Max-Age=604800`.
- **And** o JWT em `sb_access` decodifica via JWKS público com `aud="authenticated"` e `iss=https://bugpetfkyoraidyxmzxu.supabase.co/auth/v1`.

### AC-1.2 — Login com credencial inválida
- **Given** mesmo setup
- **When** `POST /api/v1/auth/login` com `{"email":"admin@dev.local","password":"WRONG"}`
- **Then** HTTP 401, body `{"detail":"invalid_credentials"}`, **sem** Set-Cookie.

### AC-1.3 — Rate limit no login
- **Given** rate limit limpo
- **When** 5 logins seguidos com senha errada para o mesmo `(email, ip)` (esperado 401 cada um), depois um 6º
- **Then** o 6º responde HTTP 429 com header `Retry-After`. **And** `INCR` de lockout em Redis chega a 1 (15 min).

### AC-1.4 — `GET /auth/me` autenticado
- **Given** sessão válida (cookies setados via login bem-sucedido)
- **When** `GET /api/v1/auth/me` com os cookies
- **Then** HTTP 200, body `{"id":"<uuid>","email":"admin@dev.local","role":"admin","created_at":"..."}`.
- **And** estrutura `request.state.user` no log inclui o `user_id` (validável via log capture no test).

### AC-1.5 — `GET /auth/me` sem cookie
- **When** `GET /api/v1/auth/me` sem cookies
- **Then** HTTP 401, body `{"detail":"not_authenticated"}`.

### AC-1.6 — Auto-refresh quando access expira
- **Given** `sb_access` cookie com `exp` no passado, `sb_refresh` válido
- **When** `GET /api/v1/auth/me` com ambos os cookies
- **Then** HTTP 200, **And** os dois cookies `sb_access` e `sb_refresh` são reescritos via `Set-Cookie` (rotação completa do par).
- **And** se o `sb_refresh` também estiver inválido, HTTP 401 e os dois cookies vêm expirados.

### AC-1.7 — Logout
- **Given** sessão válida
- **When** `POST /api/v1/auth/logout`
- **Then** HTTP 204, **And** dois `Set-Cookie` com `Max-Age=0` (limpando ambos), **And** chamada interna ao gotrue `POST /auth/v1/logout?scope=local` com o `sb_access` no `Authorization: Bearer`.

### AC-1.8 — Forgot password
- **When** `POST /api/v1/auth/forgot` com `{"email":"admin@dev.local"}`
- **Then** HTTP 200, body `{}` (resposta intencionalmente vazia para não enumerar).
- **And** chamada interna a `POST /auth/v1/recover` registrada nos logs.
- **And** mesmo com email inexistente o retorno é 200 (Supabase também não enumera).

### AC-1.9 — Reset password
- **Given** recovery access_token válido obtido manualmente via gotrue
- **When** `POST /api/v1/auth/reset` com `{"access_token":"<recovery_token>","password":"NewSecret123!"}`
- **Then** HTTP 200, body inclui o user atualizado.
- **And** a senha nova permite login (`POST /login` com `NewSecret123!` retorna 200).

### AC-1.10 — Role gate
- **Given** existem 2 usuários: `admin@dev.local` (role admin) e `viewer@dev.local` (role viewer), ambos via `bootstrap_admin.py`.
- **And** existe rota debug-only `GET /api/v1/_debug/admin-only` protegida por `Depends(require_role('admin'))` (removida ao fim da Fase 1 ou movida para Fase 2)
- **When** `viewer` autenticado faz `GET /api/v1/_debug/admin-only`
- **Then** HTTP 403, body `{"detail":"forbidden"}`.
- **And** `admin` autenticado no mesmo endpoint → HTTP 200.

### AC-1.11 — Migration `user_profiles` aplicada
- **Given** prod após T1.W4.4
- **When** Management API `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='user_profiles' order by ordinal_position`
- **Then** retorna 5 colunas `(user_id uuid, role text, created_at timestamptz, updated_at timestamptz, disabled_at timestamptz)`.
- **And** `select rowsecurity from pg_tables where tablename='user_profiles' and schemaname='public'` → `t`.
- **And** `select policyname from pg_policies where tablename='user_profiles'` retorna apenas `user_profiles_deny_all`.
- **And** `curl -H "apikey: <publishable>" .../rest/v1/user_profiles?select=user_id` → HTTP 401 (RLS efetiva).

### AC-1.12 — Bootstrap admin idempotente (prod)
- **Given** prod após T1.W4.4
- **When** `python -m backend.scripts.bootstrap_admin --email <admin> --role admin` é executado **duas** vezes consecutivas
- **Then** primeira execução cria a row em `auth.users` + `user_profiles`. Segunda execução retorna o mesmo `user_id`, faz `ON CONFLICT` no `user_profiles`, exit code 0 nas duas.
- **And** `select count(*) from public.user_profiles where role='admin'` → 1 (não duplicou).

### AC-1.13 — Frontend `/login` flow
- **Given** stack dev e admin bootstrapped
- **When** browser navega para `http://localhost:3000/login`, preenche email + password e submete
- **Then** request `POST /api/v1/auth/login` é feita com `withCredentials: true`, redirect para `/` é executado, `useAuthStore` reflete `status="authenticated"`, `user.role="admin"`.
- **And** validação Zod bloqueia submit quando email malformado ou password vazio (mensagens visíveis).

### AC-1.14 — Frontend `RequireAuth` guard
- **Given** uma rota protegida `/dashboard` (placeholder mínimo nesta fase) wrapped em `<RequireAuth>`
- **When** browser sem sessão navega para `/dashboard`
- **Then** redireciona para `/login`, `location.state.from.pathname === "/dashboard"`.
- **And** após login bem-sucedido, redireciona de volta para `/dashboard`.
- **And** se a request original a `/auth/me` retorna 401, o store entra em `unauthenticated` sem loop.

### AC-1.15 — Sentry inicializado backend + frontend
- **Given** `SENTRY_DSN` setado em backend `.env.local` e `VITE_SENTRY_DSN` em frontend `.env.local` (DSN de teste, projeto Sentry pessoal do Senhor)
- **When** backend sobe e frontend builda
- **Then** logs do backend mostram `sentry.initialized` (estruturado), e o bundle frontend contém `@sentry/react` (verificável via `grep` no `dist/`).
- **And** a rota debug `GET /api/v1/_debug/sentry` (gateada por `env != "production"`) gera um evento visível no Sentry (verificação manual; não bloqueia merge se DSN não disponível).

### AC-1.16 — Stack dev continua healthy
- **Given** após todas as outras tasks da Fase 1
- **When** `docker compose -f docker-compose.dev.yml up -d --build` e probes nos health endpoints
- **Then** 4 containers healthy, `curl :8000/health` 200, `curl :8000/api/v1/health` 200, `curl :9000/health` 200, `curl :3000/` 200.
- **And** `docker compose exec backend python -m pytest -q` passa (>= 2 testes pré-existentes + os novos).
- **And** `docker compose exec workers python -m pytest -q` passa (1 teste pré-existente).

---

## 8. Restrições Operacionais

1. **Gate humano antes de T1.W1.3** (já é o gate desta sessão): SPEC e TASKS apresentados ao Senhor para aprovação antes de qualquer commit de implementação.
2. **Gate humano antes de T1.W4.4** (bootstrap admin em prod): operação irreversível em prod (cria row em `auth.users`). Senhor fornece e-mail + senha inicial fora do chat.
3. **Gate humano antes de T1.W4.5** (smoke test fim-a-fim contra prod): validação manual de login → cookie → `/me` → 200.
4. **Backup obrigatório antes da migration `user_profiles`**: dump JSON de `pg_tables`/`pg_policies` em `phase-1-auth-bff/snapshot/pre-user-profiles-2026-xx-xx.json` (mesmo padrão da T0.9). Reversibilidade trivial: `drop table user_profiles cascade`.
5. **Nenhuma chave real no repo, em commit, em log estruturado, em snapshot, em CHECKPOINT.** Pre-commit hook + security-gate CI já bloqueiam.
6. **Os 5 migrations de Fase 0 não são modificados.** Nova migration tem timestamp posterior.
7. **Nenhum redeploy de Edge Functions.** Ficam no mesmo estado pós-Fase 0 (auto-collector stub continua 401, scheduler funcional). Fase 4 trata.

---

## 9. Riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|:---:|:---:|---|
| 1 | Supabase JWKS retorna chave HS256 (legacy) e o middleware a rejeita | B | A | Validar JWKS via `curl` antes de iniciar T1.W2.3; se HS256, usar fallback `settings.supabase_jwt_secret` (HS256 verify direto). Adicionar caminho de código condicional. |
| 2 | `httpx.AsyncClient` no `app.state` não é fechado corretamente em testes, vaza fds | B | M | `lifespan` fecha o client; testes usam `ASGITransport` que invoca `lifespan` automaticamente. Cobrir com teardown explícito no `conftest`. |
| 3 | Refresh rotation race condition em abas múltiplas | M | M | Cache Redis de 10s do refresh anterior + chave por refresh JTI. Segue padrão gotrue. |
| 4 | Rate limiter false positive em ambiente compartilhado (ex: NAT corporativo) | M | M | Chave inclui `email` + `ip`, então impacta apenas tentativas no mesmo email. Backoff fica em 15min máximo no nível 1. Documentar workaround. |
| 5 | `bootstrap_admin.py` falha porque o gotrue rejeita senha fraca | M | B | Validar com `8+ chars + 1 dígito` localmente antes de submeter. Pegar erro 422 do gotrue e exibir mensagem clara. |
| 6 | shadcn init quebra o tailwind v4 setup atual | B | M | Tailwind v4 já está com `@tailwindcss/vite` (não com PostCSS); shadcn 2.x suporta v4. Validar em branch antes de instalar componentes. Rollback: descartar config gerada e usar Button/Input minimalistas próprios. |
| 7 | `pyjwt[crypto]` adicionado conflita com `python-jose` na resolução de deps | B | B | Instalações independentes; sem conflito conhecido. Se conflitar, remover `python-jose` (não está em uso). |
| 8 | Sentry SDK gera ruído em dev local | B | B | DSN apenas via env var; sem DSN = no-op. |
| 9 | Migration `user_profiles` falha em prod por colisão de nome com tabela pré-existente | B | A | Verificar via Management API antes de aplicar. Hoje confirmado: nenhuma referência a `user_profiles` em código nem em migrations Fase 0. |
| 10 | Cookie `Secure=True` em local quebra fluxo http://localhost | B | M | `cookie_secure` default `False` em dev, `True` em prod via env var. Documentado em `.env.example`. |

---

## 10. Tasks (resumo)

Detalhe completo em `TASKS.md`. Estrutura em 5 waves verticais:

- **W1 — Design & Spec** (esta sessão): T1.W1.0 research, T1.W1.1 SPEC, T1.W1.2 TASKS, 🧍 T1.W1.3 aprovação.
- **W2 — Backend implementation** (paralelizável em time de agentes): migration, services, security, deps, endpoints, rate limit, bootstrap CLI, Sentry init.
- **W3 — Frontend implementation**: deps install, shadcn init, store, AuthProvider, páginas, RequireAuth, interceptor, Sentry init.
- **W4 — Testes e validação**: pytest, vitest, Playwright, 🧍 bootstrap admin prod, 🧍 smoke E2E prod.
- **W5 — Finalização**: CHECKPOINT, mem_save, prompt da Fase 2, merge ff-only, tag `v0.0.3-phase-1`, push.

---

## 11. Entregáveis

1. Migration `supabase/migrations/<timestamp>_user_profiles.sql` aplicada em prod.
2. Backend FastAPI com endpoints `/api/v1/auth/{login,logout,me,refresh,forgot,reset}` operacionais.
3. Backend com middleware/dependency de sessão validando JWT via JWKS local.
4. `backend/scripts/bootstrap_admin.py` operacional + idempotente.
5. Primeiro admin bootstrapped em prod (gate T1.W4.4).
6. Rate limit Redis bloqueando 6ª tentativa de login em <15 min.
7. Sentry SDK Python inicializado no backend (opt-in).
8. Frontend Vite com páginas `/login`, `/forgot-password`, `/reset-password`.
9. AuthProvider + RequireAuth + axios interceptor + Zustand store.
10. shadcn/ui inicializado com componentes mínimos para forms.
11. Sentry SDK JS inicializado no frontend (opt-in).
12. Suítes pytest backend (≥10 testes novos) verdes.
13. Suíte vitest frontend (≥5 testes novos) verde.
14. Suíte Playwright E2E (≥3 specs) rodando localmente.
15. `phase-1-auth-bff/CHECKPOINT.md` com 16 ACs verificados.
16. `phase-1-auth-bff/snapshot/pre-user-profiles-2026-xx-xx.json` (backup do estado pré-migration).
17. Tag `v0.0.3-phase-1` em `main`, pushed.
18. `mem_save` (jarvis-memory) com resumo + atualização de `memory/project_phase_status.md` marcando Fase 1 DONE e Fase 2 ativa.
19. `.planning/enterprise-rebuild/phase-2-collaborators-admin/SESSION-OPENING-PROMPT.md` redigido seguindo `docs/session-handoff-template.md`.
