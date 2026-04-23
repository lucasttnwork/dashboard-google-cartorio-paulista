# Railway Deploy Runbook

Operational reference for the three Railway services backing this project. Read
before diagnosing production incidents, adding a new service, or rotating
tokens. Invariants below are load-bearing — violating them has caused outages.

## Architecture

| Service  | Container port | Public domain                                         | serviceDomain `targetPort` (required) |
| -------- | -------------- | ----------------------------------------------------- | ------------------------------------- |
| backend  | 8000           | `backend-production-04ffb.up.railway.app`             | **8000**                              |
| frontend | 80             | `frontend-production-3749.up.railway.app`             | **80**                                |
| workers  | 9000 (internal)| _no public domain_ — reached only via private network | n/a (internal only)                   |

- Project: `b410fbce-b67d-4820-8906-846f705ae37c`
- Environment (production): `bbda7196-9ba1-42a2-9570-ca46281a3ae3`
- Backend service: `ccf479da-7015-48af-980f-312e68899a0b`
- Backend serviceDomain: `417a062f-d196-41ae-97ba-0b3c58a280c3`

Redis is a Railway addon in the same project (private network only).

## Invariants

1. **Every public serviceDomain must declare a `targetPort` matching the table
   above.** If `targetPort == null`, the edge proxy falls back to a 502 with
   `x-railway-fallback: true` and the container never sees the request. This is
   the #1 cause of "prod went dark after deploy" here.
2. **Containers bind `${PORT:-<default>}`**, not a hard-coded port. Backend:
   `sh -c exec uvicorn ... --port ${PORT:-8000}`. Workers: reads `HEALTH_PORT`
   via pydantic-settings. This makes Railway's auto-detect work as a second
   line of defense if `targetPort` drifts.
3. **`railway.json` declares `healthcheckPath`** so Railway gates traffic
   routing on the app actually being ready. No more races during rolling
   deploys. **Exception — backend:** uvicorn binds to `::` (IPv6) so the
   frontend nginx upstream can resolve `backend.railway.internal` via AAAA.
   Railway's platform healthcheck probe cannot reach that socket (observed
   2026-04-23: 4 consecutive deploys FAILED on `HEALTHCHECK failure` at
   ~54s). Backend relies on the Docker `HEALTHCHECK` directive
   (`curl localhost:8000/health`) instead. Keep `healthcheckPath` on
   frontend (nginx IPv4) and workers (aiohttp IPv4).
4. **Never delete + recreate a public domain.** It allocates a new hostname,
   which breaks: CORS origins in the backend, `VITE_API_BASE_URL` baked into
   the frontend bundle, and Supabase Auth redirect URLs. If you truly must
   change the URL, plan a coordinated rotation (backend CORS -> frontend
   rebuild -> Supabase redirect URLs) in that order.
5. **Secrets stay out of the repo.** `RAILWAY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`,
   etc. live in Railway variables or local `.env.local` (gitignored). The
   `security-gate` workflow rejects `.env` files in diffs.

## Tokens — scopes and rotation

Two distinct tokens; do not confuse them.

- **CLI session token** — stored at `~/.railway/config.json` after `railway login`.
  Scope: reads, container logs, deploy trigger. **Cannot mutate serviceDomains**
  (returns 403). Safe to use for day-to-day CLI work.
- **Project Access Token** — created at
  `Dashboard -> Project -> Settings -> Tokens -> Create Token` with environment
  = production. Full mutation scope. Required for
  `scripts/railway_ensure_target_ports.py`. Treat as a production secret:
  - Never commit.
  - Export transiently: `export RAILWAY_TOKEN=<token>` then run the script.
  - Rotate if exposed or after leaving a shared machine. Revoke old tokens in
    the same Tokens UI.

## Cold-start for a new engineer

1. Install Railway CLI: `npm i -g @railway/cli` (or `brew install railway`).
2. `railway login` then `railway link` to this project.
3. `railway status` — should list the three services + Redis addon.
4. If you need to touch domain config: create a Project Access Token (above),
   export it, run `bash scripts/railway-ensure-target-ports.sh --dry-run`.
   Review the JSON log lines. Drop `--dry-run` to apply.

## Troubleshooting 502 (backend)

Decision matrix. Walk top-down; first match is the cause.

| Symptom                                                                      | Cause                                              | Fix                                                                                                |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `x-railway-fallback: true` in response headers                               | Edge does not know which port to proxy             | Run `scripts/railway-ensure-target-ports.sh`. Verify `targetPort` via GraphQL query.               |
| Container logs show no inbound requests but `Application startup complete`   | Same as above — edge never reached the container   | Same as above.                                                                                     |
| Container logs show crash loops / `HEALTHCHECK` failing                      | App bug or missing env var                         | Check `railway logs --service backend`. Fix code or env. Redeploy.                                 |
| Container healthy, `/health` 200 from inside, external 502 intermittent      | Rolling deploy race without healthcheckPath        | Ensure `deploy.healthcheckPath` is set in `railway.json` (frontend/workers only — backend binds IPv6, see invariant 3). |
| Backend deploy stuck FAILED with `HEALTHCHECK failure` payload               | Platform healthcheck can't reach uvicorn on `::`   | Remove `healthcheckPath` from `backend/railway.json`. Docker `HEALTHCHECK` directive still gates container health.      |
| External 404 on `/api/...` but `/` works on frontend                         | Nginx proxy misconfigured                          | Check `frontend/nginx.conf` `proxy_pass ${BACKEND_URL}` + `BACKEND_URL` env on frontend container. |
| `CORS error` in browser console                                              | Backend `CORS_ORIGINS` missing the frontend URL    | Update backend env `CORS_ORIGINS` in Railway. Redeploy backend.                                    |
| `x-railway-fallback: true` + `targetPort` already correct                    | Edge cache or platform incident                    | Check https://status.railway.com. Wait 2-5 min. If persists, open support ticket.                  |

### Verify quickly

```bash
# 1. Is the edge even routing?
curl -sI https://backend-production-04ffb.up.railway.app/health | head -20
#   Look for `x-railway-fallback: true` — if present, targetPort drift.

# 2. What does Railway think targetPort is?
RAILWAY_TOKEN=<project-access-token> bash scripts/railway-ensure-target-ports.sh --dry-run
#   JSON log will show inspect events with target_port + expected per service.

# 3. Container-internal view (bypasses edge):
railway logs --service backend --deployment <id>
#   Look for `Application startup complete` + request lines.
```

## Deployment flow (normal path)

1. `git push origin main`.
2. Railway GitHub integration picks up the push and builds each service from
   its Dockerfile.
3. New image deploys; Railway waits for `healthcheckPath` to return 200 before
   routing traffic.
4. GitHub Actions `prod-smoke` workflow waits 90s, then polls `/health` for up
   to 5 minutes. Fails the run if it never converges.
5. If `prod-smoke` fails, investigate via the troubleshooting matrix above
   before merging anything else to main.

## Drift detection (ad-hoc + future cron)

Manual drift check (no changes applied):

```bash
export RAILWAY_TOKEN=<project-access-token>
bash scripts/railway-ensure-target-ports.sh --dry-run
```

A nightly cron that runs this in drift-check mode and opens a GitHub issue on
drift is a follow-up — not wired yet. If you want to wire it, add a scheduled
workflow that stores `RAILWAY_TOKEN` as a repo secret and fails the job when
the script reports drift.

## Related files

- `scripts/railway_ensure_target_ports.py` — idempotent drift-fix implementation.
- `scripts/railway-ensure-target-ports.sh` — thin bash wrapper.
- `backend/railway.json`, `workers/railway.json`, `frontend/railway.json`, root
  `railway.json` — declarative deploy config per service.
- `.github/workflows/prod-smoke.yml` — post-deploy health probe.
- `backend/Dockerfile`, `workers/Dockerfile` — `${PORT:-N}` shell-form CMD.
- `frontend/nginx.conf`, `frontend/docker-entrypoint.sh` — nginx reverse proxy
  to backend via `BACKEND_URL` env.
