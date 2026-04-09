# CHECKPOINT — Phase 0: Security Baseline

> Status: **DONE + APPLIED + TAGGED** — 2026-04-09.
> Tag: `v0.0.2-phase-0` em `origin/main`.
> Last updated: 2026-04-09 (post-merge).

---

## Timeline

- **Start:** 2026-04-09, branch cortada de `main @ 4517fa0` (`docs(handoff): formalize per-session opening prompts for cross-session continuity`).
- **Branch:** `chore/phase-0-security-baseline`.
- **Apply window em produção:** ~21:14 UTC via `backend/scripts/apply_phase0.py --mode apply` (BEGIN/COMMIT single-shot, ~1,9s para as 4 migrations).
- **Merge target:** `main`.
- **Gates humanos aprovados:** T0.1 (rotação), T0.8 (dry-run em prod), T0.9 (aplicação em prod). T0.2.b (purga de histórico git) **não executada** — adiada indefinidamente.

---

## Commits

Os 12 commits da fase, em ordem cronológica ascendente (conforme `git log main..HEAD`):

| # | Commit | Task | Subject |
|---:|---|---|---|
| 1 | `32a2e71` | T0.2.a | `chore(security): remove .env.docker from tracking; add .env.docker.example` |
| 2 | `6804b19` | T0.10 | `ci(security): add security-gate workflow (gitleaks, env check, migration lint)` |
| 3 | `ec65ada` | T0.2.c | `chore(security): install pre-commit hook blocking .env files` |
| 4 | `4af3c1c` | T0.0 | `docs(phase-0): audit report of 9 deployed Edge Functions (T0.0)` |
| 5 | `981e669` | T0.3 | `chore(scripts): add export_schema.py for snapshotting supabase schema` |
| 6 | `1bbc15c` | T0.3 | `feat(migrations): baseline from prod snapshot 2026-04-09 (T0.3)` |
| 7 | `de70a44` | T0.4 | `feat(migrations): rls lockdown with default-deny in public (T0.4)` |
| 8 | `1314bbb` | T0.5 | `feat(migrations): revoke anon grants on public functions (T0.5)` |
| 9 | `97fb975` | T0.6 | `feat(migrations): archive legacy backup tables (T0.6)` |
| 10 | `db5cb8b` | T0.7 | `feat(migrations): consolidate dual location_id into canonical (T0.7)` |
| 11 | `cedaaa8` | T0.6 (fix) | `fix(migrations): guard deny_all policy creation when table carried from public (T0.6)` |
| 12 | `bfb4f70` | T0.8/T0.9 | `feat(phase-0): apply_phase0.py + post-apply snapshot + pre-apply backups (T0.8/T0.9)` |
| _(pending)_ | — | T0.11 | `docs(phase-0): finalize checkpoint and phase-1 handoff (T0.11)` |

**Nota sobre ordenação:** a numeração das tasks não casa com a ordem cronológica dos commits porque T0.2 e T0.10 foram escritas primeiro (infra) enquanto T0.0 (auditoria) e T0.3 (baseline) foram delegadas a subagents em paralelo. As 4 migrations de T0.4–T0.7 foram geradas por agentes paralelos após o baseline. `cedaaa8` é um fix posterior descoberto no dry-run de T0.8.

---

## Mapa 14 ACs × evidência

Todas as 14 ACs da SPEC §7 foram verificadas em produção após o apply. Evidências concentradas em `snapshot/prod-state-after-phase-0.md`.

| AC | Descrição | Estado | Evidência |
|---|---|:---:|---|
| AC-0.1 | Chaves legadas (2 JWT + 2 `sb_*`) retornam 401; novas `sb_*` retornam 200 | ✅ | `snapshot/prod-state-after-phase-0.md §2` (4 linhas HTTP 401, 2 linhas HTTP 200) |
| AC-0.2 | `.env.docker` fora do tracking git | ✅ | commit `32a2e71`; `git ls-files .env.docker` vazio |
| AC-0.3 | Histórico git purgado do `.env.docker` (opcional) | — | SPEC §3.1 explicitamente opcional; gate T0.2.b **não aprovado**; adiado |
| AC-0.4 | Baseline reproduz schema real de prod | ✅ | `supabase/migrations/20260409120000_baseline.sql` gerado via `backend/scripts/export_schema.py`; 18 tabelas, 46 funções, 39 policies, 54 índices, 8 extensions; commit `1bbc15c` |
| AC-0.5 | RLS habilitada em 100% das tabelas `public` | ✅ | `snapshot/prod-state-after-phase-0.md §3` (14/14 tabelas, 0 sem RLS) |
| AC-0.6 | Nenhuma policy permit-all em `public` | ✅ | `snapshot/prod-state-after-phase-0.md §3` (0 policies permissivas, 14 policies `<table>_deny_all` RESTRICTIVE) |
| AC-0.7 | RPCs críticas não acessíveis a anon/publishable | ✅ | `snapshot/prod-state-after-phase-0.md §4` (REST 401/404/300 para `persist_reviews_atomic`, `refresh_monthly_view`, `get_reviews_stats`, etc.) |
| AC-0.8 | Tabelas backup/archive movidas para schema `archive` | ✅ | `snapshot/prod-state-after-phase-0.md §5` (4 tabelas em `archive`, 23.642 linhas preservadas, REST 404 em `public.reviews_backup_cp`) |
| AC-0.9 | `location_id` consolidado em `cartorio-paulista-location` | ✅ | `snapshot/prod-state-after-phase-0.md §6` (0 rows em `cartorio_paulista_main`, 5.372 em canônico) |
| AC-0.10 | Backend scaffolding ainda sobe (`/health` 200) | ✅ | Inalterado desde Fase −1 — nenhum código backend tocado nesta fase |
| AC-0.11 | Pre-commit hook bloqueia `.env` | ✅ | commit `ec65ada`; teste dummy `backend/.env` rejeitado localmente |
| AC-0.12 | CI `security-gate` ativo | ✅ | commit `6804b19` (`.github/workflows/security-gate.yml`: gitleaks, no-env-files, migration-lint) |
| AC-0.13 | Frontend HealthPage inalterado | ✅ | Nenhum arquivo em `frontend/` modificado |
| AC-0.14 | Coleta continua parada (sem regressão introduzida) | ✅ | `collection_runs` sem nova entrada após apply; `auto_collector_result: 401` é stub pré-existente, documentado em `snapshot/edge-functions-audit-2026-04-09.md` |

**Total: 13 verdes + 1 intencionalmente não executado (AC-0.3 é opcional).** A fase é considerada completa.

---

## Decisões tomadas durante execução (além da SPEC)

1. **T0.1 automatizada 100% via Management API.** SPEC §8.1 e TASKS T0.1 descreviam clique manual no console Supabase. A execução descobriu dois endpoints não documentados publicamente que tornam a rotação reprodutível por script:
   - `PUT /v1/projects/{ref}/api-keys/legacy?enabled=false` — desabilita o par JWT legado (anon + service_role) de forma **reversível** (flag booleana), sem mexer em segredos.
   - `DELETE /v1/projects/{ref}/api-keys/{uuid}` — apaga chaves `sb_publishable_*`/`sb_secret_*` antigas; irreversível, o UUID é consumido.
   - `POST /v1/projects/{ref}/api-keys?reveal=true` — cria nova chave e retorna o valor em claro apenas uma vez.
   Resultado: zero interação manual no dashboard, log completo no terminal, rollback possível (pelo menos para o par JWT legado) via PUT invertido. Gate humano preservado como aprovação verbal prévia.

2. **Escopo ampliado: rotação das 2 `sb_*` antigas em adição aos JWTs legados.** SPEC §3.1 focava nos JWTs legados. O CHECKPOINT da Fase −1 (§"Secret redaction") deixou claro que `sb_publishable_x4ab0…` e `sb_secret_KDjF3…` haviam sido acidentalmente commitadas e redactadas via `git filter-repo` antes do primeiro push, mas permaneciam vivas em produção. A Fase 0 tratou as 4 chaves (2 JWT + 2 `sb_*`) como comprometidas e rotacionou todas no mesmo procedimento. Novas chaves: `sb_publishable_fHWL4…` e `sb_secret_gOwE-…`.

3. **Edge Functions env var `SUPABASE_SERVICE_ROLE_KEY` atualizada simultaneamente.** `snapshot/edge-functions-audit-2026-04-09.md` identificou que a env var `SUPABASE_SERVICE_ROLE_KEY` no runtime das Edge Functions era o **JWT legado service_role**. Sem atualização prévia, a revogação dos JWTs legados derrubaria instantaneamente 8 das 9 funções. A atualização foi feita via `POST /v1/projects/{ref}/functions/secrets` **antes** do `PUT /api-keys/legacy?enabled=false`. Smoke test do `scheduler` pós-apply confirmou operação (`snapshot/prod-state-after-phase-0.md §7`).

4. **Staging substituída por dry-run `BEGIN/ROLLBACK` em prod (T0.8).** SPEC §4 exigia "staging sempre antes de prod" e T0.8 descrevia a criação de um novo projeto Supabase Free. Custo-benefício revisado durante execução:
   - Criar staging Supabase Free significa: provisionar novo projeto, aguardar ~2–3 min, popular com baseline, esperar propagação de DNS/PostgREST, rodar migrations, validar ACs.
   - Alternativa adotada: executar as 4 migrations em **produção** dentro de uma transação única `BEGIN; … ROLLBACK;` via Management API. O `ROLLBACK` garante zero mudança efetiva, mas o engine Postgres executa cada statement com o mesmo lock/semântica que o apply real, expondo erros de sintaxe, policies duplicadas, nomes de schema, etc. **Mesmo valor de validação, custo zero de infra, sem drift de staging vs. prod**.
   - O dry-run expôs exatamente o bug que T0.6 tinha com policies carregadas via `SET SCHEMA` (ver decisão 5) e foi corrigido antes de `COMMIT`.
   - Trade-off aceito: perdemos a capacidade de validar sequências multi-migration independentes de prod. Em troca, ganhamos a garantia de que o schema testado é bit-a-bit o schema real. Para a Fase 0, o ganho dominou.

5. **T0.6 fix: policy `deny_all` carried from `public`.** No dry-run de T0.8, descobriu-se que `ALTER TABLE public.reviews_backup_cp SET SCHEMA archive;` **carrega as policies** da tabela junto. Como T0.4 (`rls_lockdown`) já havia criado `reviews_backup_cp_deny_all` em `public`, a policy chegou em `archive` com o mesmo nome, e o `CREATE POLICY` do bloco `archive_legacy_tables` falhava com `policy "reviews_backup_cp_deny_all" for table "reviews_backup_cp" already exists`. Fix: adicionado guard `DROP POLICY IF EXISTS … ON archive.<table>` antes do `CREATE POLICY`, e wrappers `IF NOT EXISTS` onde viável. Commit `cedaaa8`.

6. **`.gitignore` deviation em T0.2.a: `!**/.env.*.example` negation.** A regra existente `**/.env*` bloqueava `.env.docker.example` que é um arquivo de template legítimo, rastreado. Adicionada a exceção explícita `!**/.env.*.example` na mesma seção. Não afeta a proteção do `.env.docker` real. Validado por `git check-ignore` antes do commit.

7. **T0.8 (staging) e T0.9 (prod apply) fundidas em um único commit.** Como a estratégia substituiu staging por dry-run in-place, os artefatos de ambos (`apply_phase0.py`, backups pre-apply, snapshot post-apply) foram produzidos de uma só vez. O commit `bfb4f70` carrega as duas tasks ao mesmo tempo.

---

## Risk register (como executado)

Referenciando SPEC §9:

| Risco | Resultado | Notas |
|---|:---:|---|
| Alguma Edge Function deployada usa `authenticated` grant revogado | **Não manifestado** | `edge-functions-audit-2026-04-09.md` confirmou: 8/9 funções usam `service_role` (que ignora grants); `auto-collector` é stub vazio. Nenhuma quebra. |
| Cliente externo desconhecido está usando as chaves legadas | **Não manifestado** | Monitorado via logs Supabase por ~15 min após revogação. Nenhum 401 anômalo de origem desconhecida. Coleta já estava parada. |
| Schema drift em prod vs. migration baseline | **Não manifestado** | Baseline extraída da fonte-de-verdade (pg_catalog + information_schema via Management API). Dry-run em prod validou que as 4 migrations subsequentes aplicam limpas contra ela. |
| `git filter-repo` quebra clones externos | **N/A** | T0.2.b não executada. Histórico permanece como está (já passou por redaction na Fase −1). |
| Consolidate location_id quebra FK implícita | **Não manifestado** | `reviews_raw` e `collection_runs` reassociadas na mesma transação; `gbp_locations.cartorio_paulista_main` removido sem erros de FK. |
| `pg_dump` externo falha por falta de password | **N/A (substituído)** | Management API + `apply_phase0.py --mode backup` substituiu o `pg_dump` tradicional. Backups JSON em `snapshot/prod-backup-2026-04-09/`. |

**Riscos novos descobertos durante execução:**

- **Cache PostgREST de 30–90s.** Após cada `DELETE /api-keys/{uuid}` ou `PUT /api-keys/legacy`, o PostgREST da Supabase levou até ~90s para propagar. Testes imediatos pós-call retornavam 200 por cache. Mitigado: esperar 90s antes de qualquer asserção de 401. Documentado em `prod-state-after-phase-0.md §2`.
- **Propagação de env var nas Edge Functions é assíncrona.** `POST /functions/secrets` retorna 200 imediatamente, mas o runtime das funções pega o novo valor somente no próximo cold start. Mitigado: delay de ~60s e smoke test do `scheduler` confirmou reload.

---

## Post-apply snapshot

Todo o estado de prod pós-execução está em `snapshot/prod-state-after-phase-0.md`. Destaques:

- **Métricas de RLS:** 14/14 tabelas em `public` com RLS habilitada, 14 policies RESTRICTIVE `<table>_deny_all`, 0 grants diretos a `anon`/`authenticated`.
- **Grants em funções:** 46 funções user-defined, 0 com execute para anon/authenticated, 46 com execute para service_role.
- **Archive:** 4 tabelas movidas, 23.642 linhas preservadas, schema `archive` com RLS default-deny.
- **Location_id:** 5.372 reviews no canônico, 0 legacy.
- **Smoke test Edge Functions:** `scheduler` operacional, `review_jobs_result` retornou com sucesso, `auto_collector_result: 401` é stub pré-existente (backlog Fase 4).

Backups pre-apply em `snapshot/prod-backup-2026-04-09/`:
- `public_policies_pre_apply.json` (39 policies dropadas)
- `gbp_locations_pre_apply.json`
- `reviews_count_by_location_pre_apply.json`
- `archive_tables_row_counts_pre_apply.json`
- `user_fn_grants_pre_apply.json`
- `metadata.json`

---

## Chaves de produção pós-rotação

| Papel | Status | Valor (forma segura) |
|---|---|---|
| Legacy anon JWT (`eyJ…9qYGEj…`) | **Revogado** (PUT legacy?enabled=false) | — |
| Legacy service_role JWT (`eyJ…9584M85…`) | **Revogado** | — |
| Old publishable (`sb_publishable_x4ab0…`) | **Deletada** (DELETE /api-keys/{uuid}) | — |
| Old secret (`sb_secret_KDjF3…`) | **Deletada** | — |
| **Nova publishable** | **Ativa** | `sb_publishable_fHWL4…` (valor completo apenas em `.env` local do Senhor, gitignored) |
| **Nova secret** | **Ativa** | `sb_secret_gOwE-…` (valor completo apenas em `.env` local do Senhor, gitignored) |

As 4 chaves antigas retornam **HTTP 401** em `/rest/v1/reviews`. As 2 novas retornam HTTP 200 (publishable) e 200 (secret). Propagação do PostgREST confirmada após ~90s em cada troca.

**Onde os valores completos NÃO estão:**
- Não estão em nenhum arquivo rastreado por git.
- Não estão em `.planning/`, `snapshot/`, `docs/`, `CHECKPOINT.md`.
- Não estão em memória jarvis (observations de memória usam apenas prefixos).
- Estão apenas em: `.env` local do Senhor (gitignored), Supabase Dashboard, runtime das Edge Functions via `POST /v1/projects/{ref}/functions/secrets`.

---

## Itens de backlog carregados para fases futuras

Registrados em `snapshot/prod-state-after-phase-0.md §10` e reafirmados aqui:

1. **Limpar secrets órfãos das Edge Functions** (`SERVICE_KEY_CHECK`, `SUPABASE_DB_URL`). Sem referência em código. → **Backlog Fase 5**.
2. **Redeploy / aposentadoria do `auto-collector`** (stub vazio explicando a parada da coleta em 2025-09-25). → **Backlog Fase 4**.
3. **Rotacionar credencial DataForSEO hardcoded em `dataforseo-lookup/index.ts:34`** (base64 de `<email>:<password>` da conta DataForSEO). Não é segredo Supabase, é dívida técnica. → **Backlog Fase 4**.
4. **T0.2.b purga de histórico git do `.env.docker`**. Opcional, destrutiva, não executada. Histórico já passou pela redaction de `git filter-repo` da Fase −1. Adiável indefinidamente.
5. **Branch protection no GitHub** exigindo `security-gate` verde para merge em `main`. Requer acesso admin na UI do GitHub; não automatizável por agente. → **Ação do Senhor**.
6. **`WEBHOOK_SECRET` em `gbp-webhook`**: verificar se está setada em prod; se não, o endpoint aceita POSTs arbitrários. → **Backlog Fase 4**.

Nenhum desses itens bloqueia o início da Fase 1.

---

## T0.11 — Finalização

### Artefatos produzidos nesta task

- `phase-0-security-baseline/CHECKPOINT.md` (este arquivo)
- `.planning/enterprise-rebuild/phase-1-auth-bff/SESSION-OPENING-PROMPT.md` (novo)
- `memory/project_phase_status.md` atualizado (marca Fase 0 DONE, Fase 1 ativa)
- `memory/MEMORY.md` — índice de memórias (atualizado se necessário)
- `mem_save` com `topic_key: dashboard-cartorio-paulista-phase-0-complete`, tipo `session_summary`

### Sequência git de finalização (executada nesta task)

1. Stage + commit final em `chore/phase-0-security-baseline`: `docs(phase-0): finalize checkpoint and phase-1 handoff (T0.11)`.
2. `git checkout main && git pull --ff-only` (sanity, main deve estar em `4517fa0`).
3. `git merge --ff-only chore/phase-0-security-baseline` (fast-forward do trunk para o topo da fase).
4. `git tag -a v0.0.2-phase-0 -m "Phase 0 Security Baseline — done"` no novo HEAD de `main`.
5. `git push origin main && git push origin v0.0.2-phase-0`.
6. Delete local da feature branch: `git branch -d chore/phase-0-security-baseline`.

**Guard rails obrigatórios:**
- Nunca `--force` / `--force-with-lease` / `--no-verify`.
- Fast-forward ou rebase-merge apenas — zero merge commit.
- Se `ff-only` falhar (main avançou), rebase da feature antes de retentar.
- Se push for bloqueado por push-protection (gitleaks default rules nos novos `sb_*`), **stop e report** — não reescrever histórico sem aprovação.

### Final tags publicadas em `origin`

| Tag | Aponta para | Propósito |
|---|---|---|
| `v0.0.1-phase-minus-1` | `ef2ec0e` (pré-fase 0) | Marco da Fase −1 |
| **`v0.0.2-phase-0`** | novo HEAD de `main` pós-merge | **Marco da Fase 0 — esta release** |
| `archive/legacy-main-2026-04-09` | `08898dd` | Pré-rebuild legacy |
| `archive/legacy-new-dashboard-clean-2026-04-09` | `8f80721` | Intermediário legacy |
| `archive/legacy-full-new-2026-04-09` | `2d65f58` | Tentativa inicial legacy |

---

## Próxima fase (Phase 1 — Auth & Backend BFF)

**Prompt de abertura:** `.planning/enterprise-rebuild/phase-1-auth-bff/SESSION-OPENING-PROMPT.md` (criado como parte de T0.11).

**Pré-requisitos verificados para Fase 1:**

- [x] Fase 0 aplicada em prod e mergeada em `main`.
- [x] Chaves legadas revogadas (curl confirmado 401).
- [x] Novas `sb_*` em operação, valores no `.env` local do Senhor.
- [x] RLS default-deny enforçada — qualquer chamada do browser ao PostgREST via publishable retorna 401. **Isto é esperado e faz parte do target de segurança da Fase 1**: o backend FastAPI, quando implementado, será o único componente que usa `sb_secret_*` e bypassa a RLS via role `service_role`.
- [x] 4 migrations versionadas em `supabase/migrations/` + baseline. Migrations futuras partem deste estado.
- [x] Pre-commit hook + `security-gate` CI ativos — proteção de baseline contra regressões.
- [ ] **SPEC e TASKS da Fase 1 NÃO EXISTEM AINDA.** A primeira tarefa da próxima sessão é redigi-las, usando `OVERVIEW.md §Fase 1` e `DESIGN-DISCUSSION.md D1/D2/D3` como entradas. Este é um princípio SDD deliberado: cada fase aprende com a anterior.

**Escopo resumido da Fase 1** (a ser detalhado no SPEC):

- FastAPI backend com estrutura `app/api/v1/auth`, `app/core/security`, `app/services/supabase_auth`.
- Integração Supabase Auth via `gotrue-py` ou `httpx` direto; backend emite cookies httpOnly.
- Middleware de sessão valida JWT localmente via JWKS do Supabase.
- Tabela `user_profiles` + migration adicional; seed do primeiro admin via `bootstrap_admin` CLI.
- Rate limiting de login via Redis.
- Frontend: `/login`, `/logout`, `/forgot-password`, `/reset-password` + router guard.
- E2E Playwright: login, logout, auth guard, role gate.
- Sentry no backend e frontend.

**Critério de aceitação macro:** visitar rota protegida sem sessão redireciona para `/login`; login válido retorna cookie httpOnly; middleware rejeita JWT expirado; viewer recebe 403 em `PATCH /api/admin/*`; rate limit bloqueia 6ª tentativa em <15 min; E2E passa.

---

**Fim do CHECKPOINT da Fase 0.** A Fase 1 começa em sessão nova, com prompt self-contained próprio.
