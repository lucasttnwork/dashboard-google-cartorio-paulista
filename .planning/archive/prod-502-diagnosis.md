# Prod 502 Diagnosis — Backend edge not routing

**Date**: 2026-04-22
**Reporter commit**: `c85bc700` (feat: admin user CRUD + in-app password change)
**Status**: Frontend OK, backend container OK, **edge gateway 502**.

---

## Symptom

- `https://frontend-production-3749.up.railway.app/` → 200 (bundle carrega, rotas novas presentes)
- `https://backend-production-04ffb.up.railway.app/health` → **502** com header `x-railway-fallback: true`
- Backend container: healthy. Uvicorn em `http://[::]:8000`, logs mostram `Application startup complete`, sem requests inbound (edge nunca alcança o container)

## Root cause

Railway service `backend` tem `serviceDomains[0].targetPort = null`:

```bash
railway status --json | jq '... backend .domains'
# → { "serviceDomains": [{
#      "id": "417a062f-d196-41ae-97ba-0b3c58a280c3",
#      "domain": "backend-production-04ffb.up.railway.app",
#      "targetPort": null         # ← edge não sabe qual porta proxiar
#    }] }
```

Sem `targetPort`, o edge HTTP proxy da Railway não faz forward pro container → fallback 502.

Quando o domain foi criado originalmente, ele foi detectado automaticamente via `PORT=8000` env var. Em algum redeploy recente o valor foi perdido. Last 2 deploys (`32bafa23`, `dd91d3c2`) herdaram `targetPort: null`.

## Why CLI fix falhou

- `railway domain --port 8000 --service backend` → "Domains already exist on the service" (CLI não atualiza existente, só cria)
- GraphQL `serviceDomainUpdate(input: { targetPort: 8000, ... })` via token do `~/.railway/config.json` → **403 Forbidden**. O `accessToken` do CLI (sessão UI) não tem scope de mutação de domain.

## Dados do projeto

- Project ID: `b410fbce-b67d-4820-8906-846f705ae37c`
- Environment ID (production): `bbda7196-9ba1-42a2-9570-ca46281a3ae3`
- Backend Service ID: `ccf479da-7015-48af-980f-312e68899a0b`
- Backend serviceDomain ID: `417a062f-d196-41ae-97ba-0b3c58a280c3`
- Domain: `backend-production-04ffb.up.railway.app`
- PORT env var já configurada: `8000`
- Dockerfile: `CMD ["uvicorn", "app.main:app", "--host", "::", "--port", "8000"]` + `EXPOSE 8000` + `HEALTHCHECK curl http://localhost:8000/health`

## Fix options

### Option A — Railway UI (fastest, 30s)
1. Abrir https://railway.com/project/b410fbce-b67d-4820-8906-846f705ae37c/service/ccf479da-7015-48af-980f-312e68899a0b
2. Settings → Networking → Public Networking → editar domain → Target Port = `8000` → Save
3. Aguardar ~30-60s → `curl https://backend-production-04ffb.up.railway.app/health` deve retornar 200

### Option B — Project token via GraphQL
1. Railway Dashboard → Project Settings → Tokens → "Create Token" (scope: este projeto, environment: production)
2. `export RAILWAY_TOKEN=<token>`
3. Rodar mutation:
```bash
curl -s https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "mutation($input: ServiceDomainUpdateInput!) { serviceDomainUpdate(input: $input) }",
    "variables": {"input": {
      "serviceDomainId": "417a062f-d196-41ae-97ba-0b3c58a280c3",
      "serviceId": "ccf479da-7015-48af-980f-312e68899a0b",
      "environmentId": "bbda7196-9ba1-42a2-9570-ca46281a3ae3",
      "domain": "backend-production-04ffb.up.railway.app",
      "targetPort": 8000
    }}
  }'
```

### Option C — delete + recreate (evitar: gera URL nova, quebra CORS + frontend env)

## Verification checklist após fix

1. `curl -s -o /dev/null -w '%{http_code}\n' https://backend-production-04ffb.up.railway.app/health` → `200`
2. `curl -s https://backend-production-04ffb.up.railway.app/api/v1/admin/users/` → `401 not_authenticated` (endpoint wired)
3. Login browser prod + criar user teste via `/admin/users` + verificar force-redirect + change-password + delete user
4. Cleanup user teste

## Related files

- `backend/Dockerfile` — start cmd (`--host ::`)
- `backend/railway.json` — build config (sem targetPort — não suportado em config)
- `~/.railway/config.json` — CLI session tokens
