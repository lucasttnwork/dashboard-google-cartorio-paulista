# TASKS — Phase 0: Security Baseline (v2)

> Sequencial por padrão. `[P]` = paralelizável com a anterior. Ícones: 🧍 ação humana, 🤖 agente, 🔀 paralelizável, ⚠ destrutivo.

---

## T0.0 — Pré-auditoria das Edge Functions ativas 🤖

**Objetivo:** descobrir se alguma das 9 Edge Functions deployadas depende de grants a `authenticated` ou `anon` que a Fase 0 vai revogar.

**Passos:**
1. Para cada função ativa (`dataforseo-lookup`, `auto-collector`, `scheduler`, `alerts`, `classifier`, `dataforseo-reviews`, `gbp-backfill`, `gbp-webhook`, `review-collaborator-jobs`), baixar código deployado:
   ```
   SUPABASE_ACCESS_TOKEN=... npx supabase functions download <name> --project-ref bugpetfkyoraidyxmzxu
   ```
2. Para cada uma, grep por:
   - `SUPABASE_ANON_KEY` ou `supabase_anon_key`
   - `createClient(` — ver qual key é passada
   - `.rpc(` — ver quais funções são chamadas
3. Classificar:
   - **Safe**: usa `service_role`. Continua funcionando pós-revogação.
   - **At-risk**: usa `anon` e chama RPC revogada. Precisa de mitigação.
4. Documentar em `snapshot/edge-functions-audit-2026-04-09.md`.
5. Para **at-risk**: opção A migrar para `service_role` rapidamente (mesmo código, env var diferente); opção B re-grant específico para aquela função em migration complementar.

**Verificação:** relatório existe; cada função classificada.

**Risco:** B.

**Tempo:** M

---

## T0.1 — Rotacionar chaves legadas JWT 🧍 ⚠

**Depende de:** T0.0 (para saber se alguma função ativa quebra com a rotação).

**Pré-condições:** Senhor autentica no console Supabase com acesso admin.

**Contexto:** teste em 2026-04-09 confirmou que as chaves legadas continuam retornando HTTP 200 em produção.

**Passos:**
1. Acessar https://supabase.com/dashboard/project/bugpetfkyoraidyxmzxu/settings/api
2. Localizar a seção de "Legacy API keys" (ou "JWT Secret" com opção de rotate).
3. **Antes** de revogar, verificar que:
   - Nenhuma Edge Function at-risk (T0.0) depende.
   - O `scraper/` foi arquivado (Fase −1 ✓).
   - O `dashboard-frontend/` foi arquivado (Fase −1 ✓).
   - A chave nova `sb_publishable_x4ab0Pkf2...` está em uso no backend/workers.
4. Fazer **rotate** do JWT secret OU **disable legacy keys** (dependendo da UI).
5. **Teste imediato:**
   ```bash
   # Deve retornar 401 agora:
   curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
     "https://bugpetfkyoraidyxmzxu.supabase.co/rest/v1/reviews?select=review_id&limit=1" \
     -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjQwMzU2MCwiZXhwIjoyMDcxOTc5NTYwfQ.9584M85CCoRei57hnpiwKsaiKIieWIta5rmyR8lA7-I"

   # Deve continuar retornando 200:
   curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
     "https://bugpetfkyoraidyxmzxu.supabase.co/rest/v1/reviews?select=review_id&limit=1" \
     -H "apikey: sb_publishable_REDACTED_IN_GIT_HISTORY"
   ```
6. Registrar screenshot do console em `snapshot/legacy-keys-revoked.png`.
7. Atualizar `snapshot/prod-state-2026-04-09.md` marcando item como resolvido.

**Verificação:** AC-0.1.

**Risco:** A — se alguma função ainda usa a legada, quebra imediatamente. Mitigação: T0.0 prévio.

**Tempo:** S

---

## T0.2 — Cleanup `.env.docker` + pre-commit hook 🤖

### T0.2.a — Remover do tracking (não-destrutivo)

**Passos:**
1. `git rm --cached .env.docker`
2. Sobrescrever `.env.docker` localmente com placeholders:
   ```
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_ANON_KEY=<set_in_env>
   SUPABASE_SERVICE_ROLE_KEY=<set_in_env>
   ```
3. Criar `.env.docker.example` equivalente e commitar.
4. Adicionar `.env.docker` ao `.gitignore` (já deveria estar via `.env*`, verificar).
5. Commit: `chore(security): remove .env.docker from tracking; add .env.docker.example`.

**Verificação:** `git ls-files | grep env.docker` retorna apenas `.env.docker.example`.

### T0.2.b — Purga de histórico 🧍 ⚠ (opcional)

**Depende de:** T0.2.a + aprovação explícita do Senhor.

**Passos:**
1. Backup mirror: `git clone --mirror . ../dashboard-backup-before-filter-2026-xx-xx.git`.
2. `pip install git-filter-repo`.
3. Em clone limpo: `git filter-repo --path .env.docker --invert-paths --force`.
4. Validar: `git log --all -p -- .env.docker` → vazio.
5. Validar: `git log --all -p | grep -cE '9584M85CCoRei'` → 0.
6. Force push (após aprovação verbal): `git push --force --all && git push --force --tags`.
7. Comunicar a todos os colaboradores (se houver) que precisam re-clonar.

**Verificação:** AC-0.3.

**Risco:** ⚠ irreversível para clones externos. Sem mirror, sem operação.

### T0.2.c — Pre-commit hook

**Passos:**
1. Criar `.githooks/pre-commit`:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   STAGED=$(git diff --cached --name-only)
   BAD_ENV=$(echo "$STAGED" | grep -E '^(.+/)?\.env(\.[^e][^x][^a]|$)' || true)
   if [ -n "$BAD_ENV" ]; then
     echo "❌ Refusing to commit .env files:" >&2
     echo "$BAD_ENV" >&2
     exit 1
   fi
   if command -v gitleaks >/dev/null 2>&1; then
     gitleaks protect --staged --no-banner
   fi
   ```
2. `chmod +x .githooks/pre-commit`
3. Instalar: `git config core.hooksPath .githooks`.
4. Documentar em `README.md` seção "Setup".
5. Testar: criar `backend/.env` e tentar commit → bloqueado.

**Verificação:** AC-0.11.

**Risco:** B.

**Tempo:** S

---

## T0.3 — Extrair baseline do schema real 🤖

**Objetivo:** produzir `supabase/migrations/20260409120000_baseline.sql` refletindo exatamente o estado atual de prod.

**Abordagem preferencial:** `supabase db dump --schema-only --db-url "postgresql://postgres:<PASSWORD>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"` — mas requer o database password.

**Abordagem alternativa (usada até aqui por falta do password):** reconstruir via queries na Management API:

**Passos:**
1. Solicitar ao Senhor o database password (menu Supabase Settings → Database → Connection string → Password) OU continuar via Management API.
2. Se password disponível:
   ```
   SUPABASE_DB_PASSWORD=... \
   SUPABASE_ACCESS_TOKEN=... \
   npx supabase db dump --schema public --db-url "postgresql://..." > supabase/migrations/20260409120000_baseline.sql
   ```
3. Se não, construir baseline via queries:
   - `information_schema.tables` + `information_schema.columns` → tabelas e colunas.
   - `pg_indexes` → índices.
   - `pg_constraints` → constraints (PK, FK, UNIQUE, CHECK).
   - `pg_trigger` → triggers.
   - `pg_proc` → funções.
   - `pg_policies` → policies atuais (mesmo que serão dropadas depois).
   - `pg_matviews` → materialized views.
   - Gerar o SQL determinístico a partir dessas queries via um script Python em `backend/scripts/export_schema.py`.
4. Validar: aplicar em projeto Supabase staging vazio e rodar queries de contagem de objetos.
5. Comparar contagens entre staging e prod.
6. Commit: `feat(migrations): baseline from prod snapshot 2026-04-09`.

**Verificação:** AC-0.4. Schema de staging após apply == schema de prod.

**Risco:** M — baseline imperfeita trava próximas migrations.

**Tempo:** L

---

## T0.4 — Migration `rls_lockdown` [P] 🤖

**Depende de:** T0.3.

**Passos:**
1. `supabase migration new rls_lockdown`.
2. Copiar SQL conforme SPEC §3.3.
3. Aplicar em staging: `supabase db push --linked` (staging).
4. Testar:
   ```sql
   select count(*) from pg_tables where schemaname='public' and rowsecurity=false;
   -- 0
   select count(*) from pg_policies where schemaname='public' and qual='true';
   -- 0
   ```
5. Testar com key `anon` (via REST API):
   ```
   curl .../rest/v1/reviews?select=review_id&limit=1 -H "apikey: <new_anon>"
   -- deve retornar array vazio [] ou 401
   ```
6. Commit.

**Verificação:** AC-0.5, AC-0.6.

**Risco:** A — se função deployada usa `anon` role, quebra. T0.0 mitiga.

**Tempo:** M

---

## T0.5 — Migration `revoke_anon_grants` [P] 🤖

**Depende de:** T0.3.

**Passos:**
1. `supabase migration new revoke_anon_grants`.
2. Copiar SQL conforme SPEC §3.4.
3. Aplicar em staging.
4. Testar as funções críticas:
   ```bash
   for fn in get_reviews_stats get_recent_reviews persist_reviews_atomic \
             update_location_metrics refresh_monthly_view cleanup_legacy_from_dataset; do
     echo "=== $fn ==="
     curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
       -X POST "https://<staging>.supabase.co/rest/v1/rpc/$fn" \
       -H "apikey: <staging_anon>" \
       -H "Content-Type: application/json" \
       -d '{}'
   done
   ```
5. Esperado: todas 401/403/404.
6. Commit.

**Verificação:** AC-0.7.

**Risco:** A (se algum cliente ainda usa anon → RPC). T0.0 + revisão de código cobre.

**Tempo:** M

---

## T0.6 — Migration `archive_legacy_tables` [P] 🤖

**Depende de:** T0.3.

**Passos:**
1. `supabase migration new archive_legacy_tables`.
2. Copiar SQL conforme SPEC §3.5.
3. Antes de aplicar, via Management API: `pg_dump` lógico das 4 tabelas em `snapshot/legacy-backups-2026-04-09.sql.gz` (script Python via queries `select * from ...` + pickle/ndjson — ou `COPY` via RPC se disponível).
4. Aplicar em staging (pode falhar se tabelas não existem em staging — tolerar com `if exists`).
5. Validar:
   ```sql
   select table_schema, table_name from information_schema.tables
   where table_name in ('reviews_backup_cp','review_collaborators_backup_cp','reviews_legacy_archive','reviews_raw_legacy_archive')
   order by table_name;
   -- todas devem estar em 'archive'
   ```
6. Commit.

**Verificação:** AC-0.8.

**Risco:** M. Se a migration for aplicada em staging sem as tabelas, ajustar SQL para `if exists`.

**Tempo:** M

---

## T0.7 — Migration `consolidate_location_id` [P] 🤖

**Depende de:** T0.3.

**Passos:**
1. `supabase migration new consolidate_location_id`.
2. Copiar SQL conforme SPEC §3.6.
3. Envolver em `begin; ... commit;` explícito por segurança.
4. Aplicar em staging (que provavelmente não tem os dados — skipar UPDATE silenciosamente se não houver linhas).
5. Em prod (T0.9), validar antes e depois:
   ```sql
   -- Antes:
   select location_id, count(*) from reviews group by 1;
   -- 4421 cartorio_paulista_main + 951 cartorio-paulista-location

   -- Depois:
   select location_id, count(*) from reviews group by 1;
   -- 5372 cartorio-paulista-location
   ```
6. Commit.

**Verificação:** AC-0.9.

**Risco:** B (update idempotente).

**Tempo:** S

---

## T0.8 — Aplicar todas as migrations em STAGING 🧍

**Depende de:** T0.4, T0.5, T0.6, T0.7.

**Passos:**
1. Criar projeto Supabase Free para staging se ainda não existe:
   - Nome: `cartorio-staging` (ou similar).
   - Região: same (São Paulo).
   - Copiar connection string.
2. `supabase link --project-ref <staging_ref>`.
3. `supabase db push --linked` aplicando as 5 migrations.
4. Executar ACs 0.4, 0.5, 0.6, 0.7 contra staging.
5. Se algum AC falhar, voltar e corrigir a migration correspondente.
6. Registrar screenshot / logs em `snapshot/staging-validation-2026-xx-xx.md`.

**Verificação:** todos os ACs de staging passam.

**Risco:** M.

**Tempo:** L

---

## T0.9 — Aplicar em PRODUÇÃO 🧍 ⚠

**Depende de:** T0.8 verde. Aprovação explícita do Senhor.

**Pré-condições:**
- Backup de prod fresco: `pg_dump` lógico (via CLI com password OU Management API snapshot).
- Staging validada.
- Chaves legadas já revogadas (T0.1).
- Senhor disponível para monitorar.

**Passos:**
1. Criar backup: salvar em `snapshot/prod-backup-2026-xx-xx.sql.gz`.
2. `supabase link --project-ref bugpetfkyoraidyxmzxu`.
3. `supabase db push --linked`.
4. **Monitorar logs** Supabase por ~10 minutos:
   ```
   SUPABASE_ACCESS_TOKEN=... npx supabase logs --linked
   ```
5. Executar ACs 0.5, 0.6, 0.7, 0.8, 0.9 em prod.
6. **Verificação especial:**
   - Queries de sanidade:
     ```sql
     select count(*) from reviews; -- deve ser 5372
     select count(distinct location_id) from reviews; -- 1
     select count(*) from public.reviews_backup_cp; -- erro: relation does not exist
     select count(*) from archive.reviews_backup_cp; -- 16360
     ```
7. Smoke test Edge Functions ativas:
   ```
   curl -X POST https://.../functions/v1/auto-collector -H "Authorization: Bearer <service_role>" -d '{}'
   ```
   (ver T0.0 para saber se alguma precisa ser ajustada antes).
8. Documentar timeline em `docs/runbooks/2026-xx-xx-phase-0-execution.md`.

**Verificação:** todos os ACs passam em prod.

**Risco:** 🔴 máximo. Gate humano.

**Tempo:** M (execução) + variável (monitoramento)

---

## T0.10 — CI `security-gate` [P] 🤖

**Pode rodar em paralelo com T0.3-T0.9.**

**Passos:**
1. Criar `.github/workflows/security-gate.yml`:
   ```yaml
   name: security-gate
   on:
     pull_request:
     push:
       branches: [main, new-dashboard-clean]

   jobs:
     gitleaks:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
           with: { fetch-depth: 0 }
         - uses: gitleaks/gitleaks-action@v2
           env:
             GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}  # optional for private repos

     no-env-files:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - name: Check no .env files in diff
           run: |
             FILES=$(git diff --name-only origin/main...HEAD || true)
             BAD=$(echo "$FILES" | grep -E '(^|/)\.env($|\.[^e])' || true)
             if [ -n "$BAD" ]; then
               echo "::error::.env files in diff: $BAD"
               exit 1
             fi

     migration-lint:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - name: Validate migration filenames
           run: |
             if ls supabase/migrations/*.sql 2>/dev/null; then
               for f in supabase/migrations/*.sql; do
                 base=$(basename "$f")
                 if ! [[ "$base" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]]; then
                   echo "::error::Bad migration filename: $base"
                   exit 1
                 fi
               done
             fi
   ```
2. Em GitHub → Settings → Branches: proteger `main` e `new-dashboard-clean` exigindo `security-gate` verde.
3. Teste: abrir um PR de teste com um `.env` fake → workflow falha.
4. Commit: `ci: add security-gate workflow (gitleaks + env + migration lint)`.

**Verificação:** AC-0.12.

**Risco:** B.

**Tempo:** M

---

## T0.11 — Pós-execução 🤖

**Passos:**
1. Criar `docs/runbooks/2026-xx-xx-phase-0-execution.md` com:
   - Timeline real de cada comando.
   - Commit SHAs.
   - Screenshots de Supabase.
   - Issues encontradas e resoluções.
2. Criar `phase-0-security-baseline/CHECKPOINT.md` com:
   - Status: done
   - Data início/fim
   - Lista dos 14 ACs e evidências
   - Links para migrations e commits
3. Atualizar `CLAUDE.md` se descobrirmos algo que deva ficar documentado.
4. Atualizar `.planning/enterprise-rebuild/OPEN-QUESTIONS.md` (marcar como resolvidas as que ficaram pendentes).
5. `mem_save` via jarvis-memory:
   - Tipo: `session_summary`
   - Tags: `phase-0`, `security`, `rls`, `migrations`, `complete`
   - Conteúdo: sumário executivo da fase.

**Verificação:** CHECKPOINT marcado done.

**Risco:** nenhum.

**Tempo:** S

---

## Ordem visual

```
T0.0 ──> T0.1 ──> T0.2 ──> T0.3 ──┬──> T0.4 [P] ──┐
                                   ├──> T0.5 [P] ──┤
                                   ├──> T0.6 [P] ──┼──> T0.8 ──> T0.9 ──> T0.11
                                   └──> T0.7 [P] ──┘
                                                    
T0.10 [P] rodando em paralelo desde T0.3
```

**Gates humanos:** T0.1, T0.2.b, T0.8, T0.9.

---

## Definição de "Done"

- [ ] Todos os 14 ACs da SPEC passam em prod.
- [ ] `snapshot/legacy-keys-revoked.png` existe.
- [ ] `snapshot/legacy-backups-2026-04-09.sql.gz` existe.
- [ ] `supabase/migrations/` tem as 5 migrations versionadas.
- [ ] `.github/workflows/security-gate.yml` mergeado e verde.
- [ ] `.githooks/pre-commit` instalado e documentado.
- [ ] CHECKPOINT marcado "done".
- [ ] Runbook escrito.
- [ ] Senhor aprovou encerramento.
- [ ] `mem_save` registrado.
- [ ] SPEC da Fase 1 pode começar a ser redigida.
