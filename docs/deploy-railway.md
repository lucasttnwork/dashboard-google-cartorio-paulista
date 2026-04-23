# Railway Deploy Runbook

Operational reference for the three Railway services backing this project. Read
before diagnosing production incidents, adding a new service, or rotating
tokens. Invariants below are load-bearing — violating them has caused outages.

## Architecture

| Service  | Container port | Public domain                                         | serviceDomain `targetPort` (required) |
| -------- | -------------- | ----------------------------------------------------- | ------------------------------------- |
| backend  | 8000           | _no public domain_ — private-only, reached via nginx  | n/a (internal only)                   |
| frontend | 80             | `frontend-production-28f58.up.railway.app`            | **80**                                |
| workers  | 9000 (internal)| _no public domain_ — reached only via private network | n/a (internal only)                   |

Only **frontend** is exposed publicly. Frontend nginx reverse-proxies
`/api/*` to `http://backend.railway.internal:8000` (Railway private network),
so browser traffic is same-origin and backend needs no public edge at all.

- Project: `b410fbce-b67d-4820-8906-846f705ae37c`
- Environment (production): `bbda7196-9ba1-42a2-9570-ca46281a3ae3`
- Backend service: `ccf479da-7015-48af-980f-312e68899a0b`
- Frontend service: `4fa19de7-b763-461e-8673-7e67b171ac82`
- Workers service: `d70e788c-96d5-40e5-8ed7-917a612f2d7f`

Redis is a Railway addon in the same project (private network only).

## Invariants

1. **Every public service has both `targetPort` AND an explicit `PORT` env
   var matching it.** The `targetPort` (set on the serviceDomain) tells the
   edge which port to proxy to. The `PORT` env var tells the container which
   port to bind. They must match. If `PORT` is missing on the container,
   Railway's edge routing table silently breaks in a way that survives
   redeploys and GraphQL mutations (observed 2026-04-23: 502
   `x-railway-fallback: true` on frontend because `PORT=80` was never
   defined; backend never had this problem because `PORT=8000` was set from
   day one). Fix: `variableUpsert` (`PORT=<containerPort>`) on the affected
   service.
2. **Containers bind `${PORT:-<default>}`**, not a hard-coded port. Backend:
   `sh -c exec uvicorn ... --port ${PORT:-8000}`. Frontend nginx:
   `LISTEN_PORT=${PORT:-80}` in the entrypoint. Workers: reads
   `HEALTH_PORT` via pydantic-settings. Defaults are only for local docker
   compose; production MUST pin `PORT` explicitly per invariant 1.
3. **Only the frontend has a public domain.** Backend + workers are reached
   through Railway's private network. This shrinks the edge-routing attack
   surface to one entry and makes 502 incidents affect at most the frontend
   hostname. If you add a new public service, add it to the architecture
   table above and the smoke workflow.
4. **`railway.json` declares `healthcheckPath`** on services where
   Railway's platform probe can reach the container. Frontend (nginx,
   IPv4+IPv6) and workers (aiohttp, `0.0.0.0`) have it. **Exception —
   backend:** uvicorn binds to `::` (IPv6) so the frontend nginx upstream
   can resolve `backend.railway.internal` via AAAA, but Railway's probe
   cannot reach IPv6-only sockets (observed 2026-04-23: 4 consecutive
   deploys FAILED on `HEALTHCHECK failure` at ~54s). Backend relies on the
   Docker `HEALTHCHECK` directive (`curl localhost:8000/health`) instead.
5. **Delete + recreate a public domain allocates a new hostname.** The old
   URL is gone. Plan a coordinated rotation in this order: backend
   `CORS_ORIGINS` -> frontend rebuild (if `VITE_API_BASE_URL` is set;
   currently empty so nothing to rebuild) -> Supabase Auth redirect URLs
   -> `vars.FRONTEND_URL` in GitHub Actions.
6. **Secrets stay out of the repo.** `RAILWAY_TOKEN`,
   `SUPABASE_SERVICE_ROLE_KEY`, etc. live in Railway variables or local
   `.env.local` (gitignored). The `security-gate` workflow rejects `.env`
   files in diffs.

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

## Troubleshooting 502

Decision matrix. Walk top-down; first match is the cause.

| Symptom                                                                      | Cause                                                              | Fix                                                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `x-railway-fallback: true` on frontend edge                                  | `PORT` env var missing on service (edge/container port mismatch)   | `variableUpsert` `PORT=80` on frontend (or matching container port). Redeploy is automatic.                                       |
| `x-railway-fallback: true` in response headers, container logs silent        | `targetPort` drift on serviceDomain                                | Run `scripts/railway-ensure-target-ports.sh`. Verify `targetPort` via GraphQL query.                                              |
| Container logs show no inbound requests but `Application startup complete`   | Same as above — edge never reached the container                   | Same as above. Verify both `PORT` env var and serviceDomain `targetPort` match the container-listened port.                       |
| Container logs show crash loops / `HEALTHCHECK` failing                      | App bug or missing env var                                         | Check `railway logs --service <name>`. Fix code or env. Redeploy.                                                                 |
| Container healthy, external 502 intermittent                                 | Rolling deploy race without healthcheckPath                        | Ensure `deploy.healthcheckPath` is set in `railway.json` (frontend/workers only — backend binds IPv6, see invariant 4).           |
| Backend deploy stuck FAILED with `HEALTHCHECK failure` payload               | Platform healthcheck can't reach uvicorn on `::`                   | Remove `healthcheckPath` from `backend/railway.json`. Docker `HEALTHCHECK` directive still gates container health.                |
| External 404 on `/api/...` but `/` works on frontend                         | Nginx proxy misconfigured                                          | Check `frontend/nginx.conf` `proxy_pass ${BACKEND_URL}` + `BACKEND_URL` env on frontend container.                                |
| `CORS error` in browser console                                              | Backend `CORS_ORIGINS` missing the frontend URL                    | Update backend env `CORS_ORIGINS` in Railway. Redeploy backend. (Same-origin nginx proxy usually avoids this anyway.)             |
| `x-railway-fallback: true` AND `targetPort`/`PORT` correct AND redeploy doesn't help | Edge routing table stale for this specific domain record   | Delete + recreate the public serviceDomain (accept new hostname). Update CORS + Supabase + smoke vars in the same rotation.       |

### Verify quickly

```bash
# 1. Is the edge routing?
curl -sI https://frontend-production-28f58.up.railway.app/ | head -10
#   200 = healthy. `x-railway-fallback: true` = edge can't reach container.

# 2. Does the backend respond through the private-network proxy?
curl -s https://frontend-production-28f58.up.railway.app/api/v1/health
#   Expected: {"status":"ok","service":"backend","version":"..."}

# 3. What does Railway think targetPort is?
RAILWAY_TOKEN=<project-access-token> bash scripts/railway-ensure-target-ports.sh --dry-run

# 4. Is PORT env var set on every public service?
curl -sS -X POST https://backboard.railway.com/graphql/v2 \
  -H "Project-Access-Token: $RAILWAY_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"query($p:String!,$e:String!,$s:String!){variables(projectId:$p,environmentId:$e,serviceId:$s)}","variables":{"p":"b410fbce-b67d-4820-8906-846f705ae37c","e":"bbda7196-9ba1-42a2-9570-ca46281a3ae3","s":"<service-id>"}}' \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('PORT:',d['data']['variables'].get('PORT','MISSING'))"

# 5. Container-internal view (bypasses edge):
railway logs --service <name>
```

## Deployment flow (normal path)

1. `git push origin main`.
2. Railway GitHub integration picks up the push and builds each service from
   its Dockerfile.
3. New image deploys; Railway waits for `healthcheckPath` to return 200 before
   routing traffic (frontend/workers only — backend uses Docker HEALTHCHECK).
4. GitHub Actions `prod-smoke` workflow waits 90s, then polls
   `${FRONTEND_URL}/api/v1/health` for up to 5 minutes (exercises the full
   edge -> nginx -> backend private path in one probe). Fails the run if it
   never converges.
5. If `prod-smoke` fails, investigate via the troubleshooting matrix above
   before merging anything else to main.

## Drift detection (ad-hoc + future cron)

Manual drift check (no changes applied):

```bash
export RAILWAY_TOKEN=<project-access-token>
bash scripts/railway-ensure-target-ports.sh --dry-run
```

The drift script checks that every public serviceDomain has a `targetPort`
set. It does **not** yet verify `PORT` env var presence — add that check
if you touch the script next (invariant 1 depends on it).

A nightly cron that runs this in drift-check mode and opens a GitHub issue on
drift is a follow-up — not wired yet. If you want to wire it, add a scheduled
workflow that stores `RAILWAY_TOKEN` as a repo secret and fails the job when
the script reports drift.

## Related files

- `scripts/railway_ensure_target_ports.py` — idempotent drift-fix implementation.
- `scripts/railway-ensure-target-ports.sh` — thin bash wrapper.
- `backend/railway.json`, `workers/railway.json`, `frontend/railway.json`, root
  `railway.json` — declarative deploy config per service.
- `.github/workflows/prod-smoke.yml` — post-deploy health probe (now probes
  `${FRONTEND_URL}/api/v1/health` since backend is private-only).
- `backend/Dockerfile`, `workers/Dockerfile` — `${PORT:-N}` shell-form CMD.
- `frontend/nginx.conf`, `frontend/docker-entrypoint.sh` — nginx reverse proxy
  to backend via `BACKEND_URL` env, listens on `${LISTEN_PORT:=PORT:-80}`.
