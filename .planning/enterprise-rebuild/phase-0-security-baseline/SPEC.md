# SPEC — Phase 0: Security Baseline (v2)

> Spec-level: brownfield. Primeira fase de segurança executável após a Fase −1 preparar o repositório. Template SDD.
>
> **v2 (2026-04-09):** atualizada após snapshot real de produção e pivô para Python/Railway. Escopo ampliado para cobrir funções de escrita expostas a anon, tabelas de backup não versionadas, schema drift de 9 tabelas, e consolidação de `location_id`.

---

## 0. Metadata

- **Fase:** 0
- **Depende de:** Fase −1 (Cleanup) concluída
- **Bloqueia:** Fase 1 (Auth & Backend BFF)
- **Status:** ready — todas as questões bloqueantes resolvidas
- **Proprietário:** JARVIS + Senhor (gates humanos em T0.1, T0.2.a, T0.8)

---

## 1. Objetivo

Fechar as portas abertas do sistema atual:

1. **Rotacionar credenciais expostas.** Chaves legadas JWT confirmadas ativas em 2026-04-09. São a ameaça #1.
2. **Versionar o schema real de produção.** Há 9 tabelas não declaradas no repo. Migration baseline captura o estado real, não o `init.sql` obsoleto.
3. **Consolidar RLS RESTRICTIVE** em todas as tabelas `public`, dropando as policies permissivas atuais (`USING (true)`).
4. **Revogar grants perigosos** das funções Postgres expostas a `anon`, especialmente as de **escrita** (`persist_reviews_atomic`, `update_location_metrics`, `refresh_monthly_view`, `cleanup_legacy_from_dataset`, `reprocess_reviews_for_collaborator`, `enqueue_*`, `claim_nlp_review`, etc.).
5. **Isolar backups históricos.** Mover `reviews_backup_cp`, `review_collaborators_backup_cp`, `reviews_legacy_archive`, `reviews_raw_legacy_archive` para schema `archive` com RLS default-deny. Nenhum drop — reversibilidade mantida.
6. **Consolidar `location_id` canônico.** Unificar os 4.421 reviews de `cartorio_paulista_main` para `cartorio-paulista-location`.
7. **Remover arquivos sensíveis do tracking git.** `.env.docker` fora, histórico opcional.
8. **CI gate de segredos.** gitleaks + pre-commit hook.

**Não faz parte desta fase:**
- Implementar auth (Fase 1).
- Implementar BFF endpoints (Fase 1).
- Reescrever UI (Fase 3).
- Reconstruir scraper (Fase 4).
- Deploy em Railway (acontece quando o Senhor autorizar, provavelmente perto do fim da Fase 1).

**Contexto operacional favorável:** `collection_runs` mostra que a coleta automática parou em 2025-09-25. Não há cron externo ativo a pausar, nenhum scheduler precisa ser desligado. A janela de manutenção desta fase é "agora mesmo".

---

## 2. Comportamento Atual (confirmado via snapshot 2026-04-09)

Ver `phase-0-security-baseline/snapshot/prod-state-2026-04-09.md` para relato completo. Resumo dos pontos que esta fase ataca:

| # | Problema | Evidência |
|---|---|---|
| 1 | JWT legado anon ativo | `curl -H "apikey: eyJ...9qYGEj..." .../rest/v1/reviews → 200` |
| 2 | JWT legado service_role ativo | idem, com o outro JWT → 200 |
| 3 | `.env.docker` commitado com os JWTs legados | `git ls-files .env.docker` retorna o arquivo |
| 4 | Schema drift de 9 tabelas não versionadas | `collection_runs`, `monitoring_config`, `review_alerts`, `review_collaborator_jobs`, 4 backups/archives |
| 5 | `reviews` sem RLS efetiva | policies `USING (true)` em SELECT/UPDATE, INSERT sem check |
| 6 | `collaborators` sem RLS | policies permissivas iguais |
| 7 | `review_collaborators` sem RLS | idem |
| 8 | `reviews_raw` com policy explícita para role `anon` | `reviews_raw_insert_cartorio_anon`, `reviews_raw_update_cartorio_anon` |
| 9 | Funções de leitura expostas a anon | 14+ RPCs `get_*` com `grant execute to anon` |
| 10 | **Funções de escrita expostas a anon** | `persist_reviews_atomic`, `update_location_metrics`, `refresh_monthly_view`, `cleanup_legacy_from_dataset`, `reprocess_reviews_for_collaborator`, `enqueue_*`, `claim_nlp_review`, `complete_nlp_review`, `fail_nlp_review`, `create_auto_alerts`, `process_collaborator_mentions` |
| 11 | Dois `location_id` convivendo | 4421 em `cartorio_paulista_main`, 951 em `cartorio-paulista-location` |
| 12 | 23.642 linhas em tabelas backup/archive sem RLS | `reviews_backup_cp=16360`, `review_collaborators_backup_cp=1405`, `reviews_legacy_archive=5877` |

---

## 3. Comportamento Alvo

### 3.1 Segredos e Git

- **Chaves legadas** `eyJ...9qYGEj...` e `eyJ...9584M85...` **revogadas** no console Supabase. Teste de verificação: `curl -H "apikey: <legado>"` retorna 401.
- **`.env.docker`** não rastreado. `git ls-files` não mostra. Conteúdo reescrito para placeholders.
- **`.env.docker.example`** criado com placeholders `<ROTATE_ME>`.
- **Histórico git purgado** (opcional, com aprovação explícita) via `git filter-repo --path .env.docker --invert-paths`. Backup mirror obrigatório antes.
- **Pre-commit hook** em `.githooks/pre-commit` bloqueando `.env*` não-`.example` e rodando `gitleaks` se disponível.
- **Nenhuma chave válida** aparece em `git log --all -p`.

### 3.2 Migrations baseline

- `supabase/migrations/` populado com ordem:
  1. `20260409120000_baseline.sql` — snapshot do schema REAL de produção, extraído via Management API + reconstrução.
  2. `20260409120100_rls_lockdown.sql` — drop das policies atuais + habilita RLS default-deny em todas as tabelas `public`.
  3. `20260409120200_revoke_anon_grants.sql` — revoga `execute ... from anon, authenticated` de todas as funções custom, incluindo as de escrita.
  4. `20260409120300_archive_legacy_tables.sql` — cria schema `archive`, move as 4 tabelas de backup/archive para lá, aplica RLS.
  5. `20260409120400_consolidate_location_id.sql` — reassocia reviews de `cartorio_paulista_main` para `cartorio-paulista-location`.
- **Aplicadas em staging primeiro** (novo projeto Supabase Free `cartorio-staging` ou equivalente).
- **Validação contra prod** via `supabase db diff --linked` retornando vazio.
- **Aplicação em prod** como última task, com backup prévio.

### 3.3 RLS Lockdown completo

Conteúdo conceitual da migration `rls_lockdown`:

```sql
-- 1. Drop all existing permissive policies on public tables
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I;', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 2. Enable + force RLS on every public table
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
    execute format('alter table public.%I force row level security;', r.tablename);
  end loop;
end $$;

-- 3. Default deny: single restrictive policy per table
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'create policy %I on public.%I as restrictive using (false);',
      r.tablename || '_deny_all', r.tablename
    );
  end loop;
end $$;

-- 4. Revoke direct table grants from anon/authenticated (service_role permanece)
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke all on public.%I from anon, authenticated;', r.tablename);
  end loop;
end $$;
```

Nenhuma policy de liberação — backend usa `service_role` que bypassa RLS.

### 3.4 Revoke anon grants das funções

```sql
-- Revoke execute from anon on ALL user-defined functions in public
-- (preserve service_role access; authenticated is revoked too — Fase 1 re-grants if needed)
do $$
declare f record;
begin
  for f in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        -- skip extension-owned functions
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'revoke execute on function public.%I(%s) from anon, authenticated, public;',
      f.proname, f.args
    );
  end loop;
end $$;

-- Revoke also from the materialized view
revoke all on public.mv_monthly from anon, authenticated;
```

**Funções críticas de escrita** que a revogação fecha:
- `persist_reviews_atomic`, `update_location_metrics`, `refresh_monthly_view`
- `cleanup_legacy_from_dataset`, `reprocess_reviews_for_collaborator`
- `create_auto_alerts`, `process_collaborator_mentions`
- `enqueue_nlp_review`, `enqueue_review_collaborator_job`, `enqueue_collaborator_refresh_job`
- `claim_nlp_review`, `complete_nlp_review`, `fail_nlp_review`

### 3.5 Archive de tabelas legadas

```sql
-- Create archive schema
create schema if not exists archive;

-- Move the 4 tables
alter table public.reviews_backup_cp               set schema archive;
alter table public.review_collaborators_backup_cp  set schema archive;
alter table public.reviews_legacy_archive          set schema archive;
alter table public.reviews_raw_legacy_archive      set schema archive;

-- Enable RLS default-deny on each
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'archive'
  loop
    execute format('alter table archive.%I enable row level security;', r.tablename);
    execute format('alter table archive.%I force row level security;', r.tablename);
    execute format(
      'create policy %I on archive.%I as restrictive using (false);',
      r.tablename || '_deny_all', r.tablename
    );
    execute format('revoke all on archive.%I from anon, authenticated, public;', r.tablename);
  end loop;
end $$;

-- Revoke usage on schema from non-service roles
revoke all on schema archive from anon, authenticated, public;
```

Decisão de drop fica para após 90 dias sem uso, em migration futura.

### 3.6 Consolidate `location_id`

```sql
-- Ensure canonical location exists in gbp_locations
insert into public.gbp_locations (location_id, account_id, name, title)
select 'cartorio-paulista-location', account_id, name, title
from public.gbp_locations
where location_id = 'cartorio_paulista_main'
on conflict (location_id) do nothing;

-- Reassociate reviews
update public.reviews
   set location_id = 'cartorio-paulista-location'
 where location_id = 'cartorio_paulista_main';

update public.reviews_raw
   set location_id = 'cartorio-paulista-location'
 where location_id = 'cartorio_paulista_main';

-- Reassociate other tables that reference location_id
update public.collection_runs
   set location_id = 'cartorio-paulista-location'
 where location_id = 'cartorio_paulista_main';

-- Drop obsolete location row
delete from public.gbp_locations where location_id = 'cartorio_paulista_main';
```

**Validação pós-migration:**
```sql
select location_id, count(*) from reviews group by 1;
-- deve retornar apenas cartorio-paulista-location com 5372
```

### 3.7 Scaffolding permanece em modo "pré-auth"

- `backend/` continua servindo apenas `/health`.
- `frontend/` continua mostrando a HealthPage.
- Nenhum endpoint de dados é adicionado — isso é Fase 1.
- O `docker-compose.dev.yml` funciona.

### 3.8 CI mínimo de segredos

Criar `.github/workflows/security-gate.yml`:
- `secrets-scan`: `gitleaks-action@v2` rodando em todo PR.
- `no-env-files`: bash script falhando se algum `.env` (não `.example`) aparece no diff.
- `migration-lint`: valida que todo arquivo em `supabase/migrations/` tem prefixo timestamp e extensão `.sql`.
- `sql-lint`: `sqlfluff` ou regex simples para sanidade.

Branch protection: exigir o job `security-gate` verde para merge em `new-dashboard-clean` e `main`.

---

## 4. Invariantes

1. **Nenhum dado deletado.** Backups apenas movidos para schema `archive`. Reviews consolidados via UPDATE, não re-insert.
2. **Nenhuma quebra de frontend.** Não há frontend funcional ainda (só HealthPage) — qualquer quebra é trivial.
3. **service_role continua funcionando.** Todas as migrations mantêm `service_role` com acesso total.
4. **Staging sempre antes de prod.** Nenhuma migration aplicada em prod sem ter rodado limpa em staging.
5. **Backups antes de destrutivas.** `pg_dump` lógico de prod antes de cada migration com write. Arquivado em `phase-0-security-baseline/snapshot/`.
6. **Chaves legadas verificadas como revogadas** antes da fase ser marcada "done".
7. **Nenhum deploy em Railway** nesta fase. Só prepara migrations e configuração.

---

## 5. Limites de Escopo

### In
- Rotação de chaves legadas.
- Migrations SQL (5 novas) em `supabase/migrations/`.
- `.env.docker` cleanup.
- Pre-commit hook.
- CI workflow de segredos.
- Validação em staging.
- Aplicação em prod.
- CHECKPOINT + runbook.

### Out
- Endpoints de auth (Fase 1).
- Qualquer código de negócio no backend.
- Frontend além do HealthPage.
- Reescrever Edge Functions atuais (aposentam na Fase 4).
- Implementar arq tasks (Fase 4).
- Deploy em Railway.
- Observabilidade completa (Fase 5).

---

## 6. Stack / Padrões

- **Supabase CLI** (via `npx supabase@latest`) com `SUPABASE_ACCESS_TOKEN` do Senhor.
- **Management API** (`https://api.supabase.com/v1/projects/{ref}/database/query`) para inspeção e aplicação de SQL ad-hoc quando o CLI falhar (ex.: como aconteceu com `db dump` por falta de password).
- **`git filter-repo`** para purga de histórico (opcional, com aprovação).
- **`gitleaks`** no CI.
- **Python 3.12** para eventuais scripts de validação (ex.: verificação pós-migration em `backend/scripts/verify_phase_0.py`).

**Convenções de migration:**
- Nome: `YYYYMMDDHHMMSS_<snake_case>.sql`.
- Header: `-- <nome>, author, date, purpose, reference to SPEC`.
- Reversibilidade: `-- Down: <descrição do rollback>` em comentário quando viável.
- Idempotência: `if exists`/`if not exists` onde apropriado.
- Rodar sempre sob `BEGIN; ... COMMIT;` implícito do Supabase CLI.

---

## 7. Verificação / Critérios de Aceitação

Given/When/Then obrigatórios, executáveis.

### AC-0.1 — Chaves legadas revogadas
- **Given** após T0.1
- **When** `curl -H "apikey: eyJ...9qYGEj..." https://bugpetfkyoraidyxmzxu.supabase.co/rest/v1/reviews?select=review_id&limit=1`
- **Then** HTTP 401.
- **And** mesmo teste com o service_role JWT legado → HTTP 401.
- **And** `curl -H "apikey: sb_publishable_x4ab0Pkf2..."` → HTTP 200 (nova chave continua funcionando).

### AC-0.2 — `.env.docker` fora do git
- **Given** HEAD após Fase 0
- **When** `git ls-files | grep -E '\.env(\.docker)?$'`
- **Then** apenas `.env.example` e `.env.docker.example`.

### AC-0.3 — Histórico purgado (se aprovado)
- **Given** purga executada
- **When** `git log --all -p | grep -cE 'eyJhbGciOi.{100}|sb_secret_'`
- **Then** retorno é `0`.

### AC-0.4 — Migrations versionadas reproduzem prod
- **Given** staging Supabase vazio com nossas migrations aplicadas
- **When** comparação schema entre staging e prod (via queries de `information_schema`)
- **Then** zero diferenças estruturais significativas.

### AC-0.5 — RLS habilitada em todas as tabelas public
- **Given** prod após migrations
- **When** Management API executa `select count(*) from pg_tables where schemaname = 'public' and rowsecurity = false`
- **Then** resultado é `0`.

### AC-0.6 — Nenhuma policy permit-all em `public`
- **Given** prod após migrations
- **When** `select count(*) from pg_policies where schemaname = 'public' and (qual = 'true' or qual is null)`
- **Then** resultado é `0`.

### AC-0.7 — RPCs não acessíveis a anon
- **Given** prod após migrations
- **When** `curl -X POST https://.../rest/v1/rpc/get_reviews_stats -H "apikey: sb_publishable_..."`
- **Then** HTTP 401 ou 403 ou 404.
- **And** mesmo teste com `persist_reviews_atomic`, `update_location_metrics`, `refresh_monthly_view`, `cleanup_legacy_from_dataset` — todos retornam erro.

### AC-0.8 — Tabelas backup/archive movidas
- **Given** prod após migrations
- **When** `select count(*) from public.reviews_backup_cp`
- **Then** `relation "public.reviews_backup_cp" does not exist`.
- **And** `select count(*) from archive.reviews_backup_cp` com service_role → `16360`.

### AC-0.9 — `location_id` consolidado
- **Given** prod após migrations
- **When** `select location_id, count(*) from reviews group by 1`
- **Then** uma única linha: `cartorio-paulista-location | 5372`.

### AC-0.10 — Backend scaffolding ainda sobe
- **Given** após todas as migrations
- **When** `docker compose -f docker-compose.dev.yml up -d && curl http://localhost:8000/health`
- **Then** HTTP 200 (sanity check — não quebramos scaffolding).

### AC-0.11 — Pre-commit hook bloqueia `.env`
- **Given** hook instalado
- **When** crio `backend/.env` e `git add && git commit`
- **Then** commit é abortado com mensagem explicativa.

### AC-0.12 — CI `security-gate` funciona
- **Given** workflow commitado
- **When** abro PR com um `sb_secret_fake` hardcoded em um arquivo
- **Then** workflow `security-gate` falha com alerta do gitleaks.

### AC-0.13 — Frontend (HealthPage) continua exibindo dados mínimos
- **Given** scaffolding de Fase −1
- **When** abro `http://localhost:3000/`
- **Then** vejo o HealthPage com JSON `{"status":"ok","service":"backend"}`.

### AC-0.14 — Coleta continua parada (não introduzimos regressão)
- **Given** nenhuma task de coleta rodou nesta fase
- **When** inspeciono `collection_runs` via Management API
- **Then** última execução continua sendo `2025-09-25`.

---

## 8. Restrições Operacionais

1. **Gate humano obrigatório antes de T0.1** (rotação de chaves legadas) — ação irreversível.
2. **Gate humano antes de T0.2.a** (purga de histórico git) — só se o Senhor aprovar explicitamente.
3. **Gate humano antes de T0.8** (aplicação em prod) — janela coordenada.
4. **Backup obrigatório** antes de T0.8: `pg_dump` lógico exportado via Supabase Management API queries (chunked) ou usando o CLI com password.
5. **Nenhuma modificação nas Edge Functions deployadas** — elas podem eventualmente falhar (se usavam funções Postgres agora revogadas via `authenticated` role), mas serão aposentadas na Fase 4. Validar nos logs do Railway se alguma função cliente quebra.
6. **Nenhuma destruição em `archive`**. O schema é imutável nesta fase.

---

## 9. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|:---:|:---:|---|
| Alguma Edge Function deployada usa `authenticated` grant revogado | M | M | Auditoria prévia das 9 functions ativas (T0.0.a). Se alguma usar, re-grant específico para aquela função. |
| Cliente externo desconhecido está usando as chaves legadas | B | A | Monitorar logs do Supabase logo após revogação. Rollback: gerar nova JWT legacy key e reativar temporariamente. |
| Schema drift em prod vs. migration baseline | M | A | Extrair baseline via Management API (não CLI dump); validar byte-a-byte em staging. |
| `git filter-repo` quebra clones existentes | B | M | Comunicação prévia; mirror backup antes; operação fora de horário crítico. |
| Consolidate location_id quebra FK implícita | B | A | Validar em staging primeiro; envolver update em transação; rollback plan documentado. |
| `pg_dump` externo falha por falta de password | A | B | Usar Management API query-by-query como fallback (já validado nesta sessão). |

---

## 10. Tasks

Detalhe completo em `TASKS.md`. Resumo:

- **T0.0** Pré-auditoria das 9 Edge Functions ativas
- **T0.1** 🧍 Rotacionar chaves legadas JWT no console Supabase
- **T0.2** Cleanup do `.env.docker` + pre-commit hook (a: remove do tracking; b: purga histórico opcional)
- **T0.3** Extrair baseline do schema real de prod via Management API
- **T0.4** [P] Criar migration `rls_lockdown`
- **T0.5** [P] Criar migration `revoke_anon_grants`
- **T0.6** [P] Criar migration `archive_legacy_tables`
- **T0.7** [P] Criar migration `consolidate_location_id`
- **T0.8** 🧍 Aplicar em staging + validar (gate humano para prosseguir)
- **T0.9** 🧍 Aplicar em prod (backup prévio, gate humano)
- **T0.10** [P] CI workflow `security-gate`
- **T0.11** Pós-execução: runbook, CHECKPOINT, `mem_save`, atualização de `CLAUDE.md` se necessário

---

## 11. Entregáveis

1. Chaves legadas revogadas (confirmado por teste).
2. `.env.docker` fora do tracking (e fora do histórico, se aprovado).
3. `supabase/migrations/` populado com 5 migrations + 1 baseline.
4. Prod com RLS default-deny em todas as tabelas `public`.
5. Prod com grants `anon`/`authenticated` revogados nas funções custom.
6. Prod com backups em schema `archive` e `location_id` consolidado.
7. `.github/workflows/security-gate.yml` ativo.
8. `.githooks/pre-commit` instalado.
9. `phase-0-security-baseline/CHECKPOINT.md` marcado "done".
10. `docs/runbooks/2026-xx-xx-phase-0-execution.md` com timeline real.
11. `mem_save` com resumo.
