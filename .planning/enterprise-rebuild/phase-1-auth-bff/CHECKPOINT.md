# CHECKPOINT — Phase 1: Auth & Backend BFF

**Status:** DONE
**Branch:** `feat/phase-1-auth-bff`
**Tag:** `v0.0.3-phase-1`
**Sessions:** 2 (2026-04-09 W1+W2, 2026-04-10 W3+W4+W5)

---

## Timeline

| Wave | Scope | Session | Duration |
|---|---|---|---|
| W1 | SPEC + TASKS | 2026-04-09 | ~30min |
| W2 | Backend (10 modules, 80 tests) | 2026-04-09 | ~3h |
| W3 | Frontend (store, pages, guard, sentry) | 2026-04-10 | ~20min |
| W4 | Tests + prod deploy + smoke test | 2026-04-10 | ~30min |
| W5 | Finalization | 2026-04-10 | ~20min |

---

## Commits (20 total)

| # | Hash | Task | Summary |
|---|---|---|---|
| 1 | `1ec8955` | T1.W1 | SPEC.md + TASKS.md |
| 2 | `90d84a9` | T1.W2.0 | Scaffolding: pyproject + config + stubs |
| 3 | `4598959` | T1.W2.1 | Migration `user_profiles` (RLS deny_all) |
| 4 | `e4a1829` | T1.W2.2 | core/security.py — JWKS + PyJWT |
| 5 | `d49c155` | T1.W2.3 | services/supabase_auth.py — httpx relay |
| 6 | `19708d2` | T1.W2.4 | services/rate_limit.py — Redis sliding window |
| 7 | `eca5e75` | T1.W2.5 | deps/auth.py — role gate + auto-refresh |
| 8 | `f0b81ec` | T1.W2.6 | api/v1/auth.py — 6 endpoints |
| 9 | `8ffded6` | T1.W2.7 | bootstrap_admin.py CLI |
| 10 | `5bd9e6a` | T1.W2.8 | Sentry + RequestId + lifespan wiring |
| 11 | `ea15207` | — | Session opening prompt for W3 |
| 12 | `88b0a70` | T1.W3.1 | Install deps + shadcn/ui init |
| 13 | `0c271c4` | T1.W3.2 | Auth store, API wrappers, AuthProvider |
| 14 | `d5560f4` | T1.W3.3 | Login, Forgot, Reset pages |
| 15 | `3cb2cd9` | T1.W3.4 | RequireAuth guard + router |
| 16 | `980c375` | T1.W3.5 | Sentry React init |
| 17 | `8bb7fd1` | T1.W4.2 | Frontend vitest suite (15 new, 16 total) |
| 18 | `2694ea3` | T1.W4.3 | Playwright E2E specs (3 files) |
| 19 | `b784a7e` | T1.W4.4 | Apply migration + bootstrap admin in prod |
| 20 | `b47fbfc` | T1.W4.5 | Smoke test evidence |

---

## Acceptance Criteria

| AC | Description | Evidence |
|---|---|---|
| AC-1.1 | POST /login returns 200 + cookies on valid creds | test_auth_login.py + smoke test step 1 |
| AC-1.2 | POST /login returns 401 on invalid creds | test_auth_login.py + smoke test step 4 |
| AC-1.3 | GET /me returns user profile with role | test_auth_me.py |
| AC-1.4 | POST /logout returns 204 + clears cookies | test_auth_logout.py + smoke test step 5 |
| AC-1.5 | Auto-refresh on expired access + valid refresh | test_auth_refresh.py |
| AC-1.6 | POST /forgot returns 200 {} (anti-enumeration) | test_auth_forgot_reset.py |
| AC-1.7 | POST /reset updates password | test_auth_forgot_reset.py |
| AC-1.8 | Rate limit 429 on 6th attempt | test_rate_limit.py |
| AC-1.9 | Lockout escalation (15min, 1h, 24h) | test_rate_limit.py |
| AC-1.10 | Role gate /_debug/admin-only | test_role_gate.py |
| AC-1.11 | user_profiles table with RLS deny_all | snapshot/post-bootstrap-2026-04-10.md |
| AC-1.12 | Bootstrap admin idempotent | Verified: second upsert, count=1 |
| AC-1.13 | Frontend /login page with form validation | LoginPage.test.tsx |
| AC-1.14 | RequireAuth redirects to /login | RequireAuth.test.tsx |
| AC-1.15 | AuthProvider hydrates on boot | AuthProvider.test.tsx |
| AC-1.16 | Sentry init opt-in via env var | sentry.ts + observability.py |

---

## Technical Decisions (final, do not revisit)

| ID | Decision | Rationale |
|---|---|---|
| D1.1 | httpx direct (not supabase-auth lib) | Stateless BFF, 1:1 gotrue coverage, no constraint on httpx version |
| D1.2 | pyjwt[crypto] + PyJWKClient | Built-in JWKS cache, kid lookup, async-compatible via to_thread |
| D1.3 | Role via user_profiles DB lookup | Avoids fragile app_metadata sync; PK lookup on small table |
| D1.4 | HS256 fallback | Supabase project still on legacy HS256; `supabase_jwt_hs_secret` enables validation |
| D1.5 | Cookies sb_access(1h) + sb_refresh(7d) | httpOnly, Secure configurable, SameSite=Lax |
| D1.6 | Sorted-set sliding window rate limit | 5/15min + lockout [15min, 1h, 24h] per (email, ip) |

---

## Test Suites

| Suite | Count | Status |
|---|---|---|
| Backend pytest | 80 | All green |
| Frontend vitest | 16 (15 new) | All green |
| Playwright E2E | 3 specs (auth-guard runs standalone, login/logout need admin) | Created, gate-dependent |

---

## Risk Register

| Risk | Materialized? | Mitigation |
|---|---|---|
| JWKS empty (HS256 legacy) | Yes | HS256 fallback via supabase_jwt_hs_secret |
| shadcn/ui + Tailwind v4 compat | Minor — form component unavailable | Used react-hook-form directly with Input/Label |
| Chunk size > 500KB | Yes (522KB) | Acceptable for Phase 1; code-splitting in Phase 3 |
| DB password unavailable via API | Yes | Smoke test via curl + Management API |

---

## Security State Post-Phase 1

- 15 tables in `public` (14 Phase 0 + user_profiles)
- 15 RESTRICTIVE deny_all policies (all tables)
- Admin user bootstrapped: `8b7e91a7-3aba-4f28-aa2f-99eb192b47a9`
- Keys unchanged from Phase 0: `sb_publishable_fHWL4...`, `sb_secret_gOwE-...`
- JWT validation: HS256 via shared secret (asymmetric migration pending)

---

## Backlog for Future Phases

- **Phase 2:** CRUD collaborators, merge, aliases, audit log
- **Phase 3:** Dashboard pages, code-splitting, Recharts
- **Phase 5:** Migrate Supabase to asymmetric JWT keys (RS256/ES256)
- **Phase 5:** Obtain DB password or configure direct pooler access for full E2E in CI
- **Phase 5:** MFA TOTP, password complexity rules
- **Cleanup:** Remove unused `python-jose` dependency
- **Cleanup:** Rotate `SUPABASE_ACCESS_TOKEN` (same since Phase 0)
