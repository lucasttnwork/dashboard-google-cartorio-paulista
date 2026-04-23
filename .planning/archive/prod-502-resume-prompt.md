# Prompt — Nova sessão Claude Code: Fix prod 502

Cole isto inteiro numa nova sessão em `/home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista`:

---

Leia `.planning/prod-502-diagnosis.md` para contexto completo antes de qualquer ação.

**TL;DR do problema**: após o deploy do commit `c85bc700` (feat: admin user CRUD + change-password), o backend Railway retorna 502 com `x-railway-fallback: true`. Diagnóstico apontou que o campo `serviceDomains[0].targetPort` está `null` no serviço backend — edge proxy da Railway não sabe em qual porta bater. Container está saudável internamente (uvicorn em `[::]:8000`, logs mostram startup OK sem nenhum request inbound). Todo o código já está no main; precisa apenas fixar infra.

**IDs relevantes** (confirme via `railway status --json` antes de usar):
- Project: `b410fbce-b67d-4820-8906-846f705ae37c`
- Environment (production): `bbda7196-9ba1-42a2-9570-ca46281a3ae3`
- Backend service: `ccf479da-7015-48af-980f-312e68899a0b`
- Backend serviceDomain: `417a062f-d196-41ae-97ba-0b3c58a280c3`
- Domain público: `backend-production-04ffb.up.railway.app`

**Tarefa**:

1. Confirme o problema ainda existe:
   ```bash
   curl -s -o /dev/null -w 'health=%{http_code}\n' https://backend-production-04ffb.up.railway.app/health
   railway status --json | python3 -c "import sys,json; d=json.load(sys.stdin); s=[e['node'] for e in d['environments']['edges'][0]['node']['serviceInstances']['edges'] if e['node']['serviceName']=='backend'][0]; print(json.dumps(s['domains'], indent=2))"
   ```
   Se `targetPort` ainda for `null` e health=502, prossiga. Se já estiver 8000 e health=200, problema resolveu sozinho — só valide a feature E2E (pula pra passo 3).

2. **Fix**. Tente em ordem de preferência:

   a. **CLI** (menos provável funcionar pois já tentamos): `railway link && railway service backend && railway domain --port 8000` — se retornar "Domains already exist", pula pro (b).

   b. **GraphQL com project token**. Peça ao usuário um token Railway com scope de mutação (Dashboard → Project Settings → Tokens → Create Token, ambiente=production). Depois:
   ```bash
   export RAILWAY_TOKEN=<token>
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
   A última sessão tentou com token do `~/.railway/config.json` e recebeu 403 — CLI token tem scope insuficiente; precisa de Project Access Token.

   c. **UI manual** (30s, funciona sempre): peça ao usuário pra abrir https://railway.com/project/b410fbce-b67d-4820-8906-846f705ae37c/service/ccf479da-7015-48af-980f-312e68899a0b → Settings → Networking → editar o domínio público → Target Port = `8000` → Save.

3. **Verifique**:
   ```bash
   # wait for edge to propagate (~30-60s)
   until [ "$(curl -s -o /dev/null -w '%{http_code}' https://backend-production-04ffb.up.railway.app/health)" = "200" ]; do sleep 5; done
   # probe endpoints
   curl -s -o /dev/null -w 'health=%{http_code}\n' https://backend-production-04ffb.up.railway.app/health
   curl -s -o /dev/null -w 'admin_users_unauth=%{http_code}\n' https://backend-production-04ffb.up.railway.app/api/v1/admin/users/
   curl -s -o /dev/null -w 'change_pwd_unauth=%{http_code}\n' -X POST https://backend-production-04ffb.up.railway.app/api/v1/auth/change-password -H 'Content-Type: application/json' -d '{"current_password":"x","new_password":"yyyyyyyy"}'
   ```
   Esperado: `health=200`, `admin_users_unauth=401`, `change_pwd_unauth=401`.

4. **E2E via MCP playwright** (ou `frontend/e2e-admin-users.mjs` adaptado com base URL de prod):
   - Login admin em `https://frontend-production-3749.up.railway.app/login` (creds no `/.env` local)
   - `/admin/users` → criar usuário teste com senha temporária (use `ana.prod.test@example.com` ou similar)
   - Logout → login com novo usuário → confirmar força redirect `/account/password`
   - Preencher + salvar → confirmar navega livre
   - Logout → login admin → deletar usuário teste → cleanup

5. Se tudo OK, reporte status final + screenshots. Se algo falhar, diagnostique antes de mudar código.

**Proibido**:
- Não fazer deploys novos apenas pra "tentar resolver" — é problema de config de edge, não de código.
- Não deletar e recriar o domain sem permissão explícita (gera URL nova → quebra CORS + frontend env + Supabase redirect URLs).
- Não commitar `.env` nem tokens.

**Mode**: caveman ultra (terso, inglês/português misturado é OK, sem filler).
