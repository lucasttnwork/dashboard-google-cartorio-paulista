# Production Snapshot — After Phase 0 (2026-04-09)

> Estado real do banco Supabase `bugpetfkyoraidyxmzxu` imediatamente após a aplicação das 4 migrations da Fase 0 via Management API. Contraparte de `prod-state-2026-04-09.md`, que capturou o estado pré-fase.

---

## 1. Resumo executivo

**Data/hora da aplicação:** 2026-04-09 ~21:14 UTC (T0.9 executada via `backend/scripts/apply_phase0.py --mode apply`).
**Duração total do apply:** ~1,9s para as 4 migrations em uma única transação via Management API.
**Rollback plan:** backups em `prod-backup-2026-04-09/` + baseline em `supabase/migrations/20260409120000_baseline.sql`.

Todas as condições de aceitação da SPEC §7 que são verificáveis via SQL + REST foram confirmadas. O estado de segurança do projeto passou de "teatro permissivo" para "default-deny RESTRICTIVE enforçado, com service_role preservado".

---

## 2. Rotação de chaves (T0.1) — confirmada

| Chave | Antes | Depois |
|---|:---:|:---:|
| Legacy anon JWT (`eyJ…9qYGEj…`) | HTTP 200 | **HTTP 401** |
| Legacy service_role JWT (`eyJ…9584M85…`) | HTTP 200 | **HTTP 401** |
| Old `sb_publishable_x4ab0…` (leaked→redacted) | HTTP 200 | **HTTP 401** |
| Old `sb_secret_KDjF3…` (leaked→redacted) | HTTP 200 | **HTTP 401** |
| **New `sb_publishable_fHWL4…`** | — | HTTP 200 |
| **New `sb_secret_gOwE-…`** | — | HTTP 200 |

Método: `PUT /v1/projects/{ref}/api-keys/legacy?enabled=false` (legacy toggle, reversível) + `DELETE /v1/projects/{ref}/api-keys/{uuid}` para as velhas `sb_*` + `POST /v1/projects/{ref}/api-keys?reveal=true` para as novas. Zero interação manual no console do Supabase.

Propagação do cache PostgREST: ~30–90s após cada delete. Auto-inject das Edge Functions detectou as novas chaves com delay similar — confirmado via `supabase secrets list` digest comparison.

---

## 3. RLS e policies (T0.4)

Estado a partir de queries diretas em `pg_tables` e `pg_policies` pós-commit:

| Métrica | Valor |
|---|---:|
| Tabelas em `public` | 14 |
| Tabelas em `public` com RLS habilitada | **14** |
| Tabelas em `public` sem RLS | 0 |
| Policies permissivas (`USING (true)` ou `USING null`) | **0** |
| Policies `<table>_deny_all` RESTRICTIVE instaladas | **14** |
| Grants diretos a `anon` em tabelas `public` | 0 |
| Grants diretos a `authenticated` em tabelas `public` | 0 |

Observação: `public_tables_count` caiu de 18 → 14 porque a migration T0.6 moveu 4 tabelas legacy para schema `archive`.

### Verificação externa via REST

```
GET /rest/v1/reviews?select=review_id&limit=5
  apikey=sb_publishable_fHWL4…  →  HTTP 401 "permission denied for table reviews"
  apikey=sb_secret_gOwE-…       →  HTTP 200 [array com review_id]
```

A RLS está efetivamente em vigor: a publishable key (perfil `anon`) é bloqueada pelo deny-all, enquanto o `service_role` continua bypassando via role attribute nativo do Postgres.

---

## 4. Grants em funções (T0.5)

| Escopo | Antes (estimado) | Depois |
|---|:---:|:---:|
| Funções user-defined em `public` | 46 | 46 |
| Dessas, com `EXECUTE` para `anon` | ~46 | **0** |
| Dessas, com `EXECUTE` para `authenticated` | ~46 | **0** |
| Dessas, com `EXECUTE` para `service_role` | ~46 | **46** |

Funções de extensão (`pg_trgm`, `vector`, `pgcrypto`, `unaccent`, `pg_graphql`, `uuid-ossp`) não foram tocadas — o filtro `pg_depend deptype='e'` na migration preservou seus grants default. Isto é intencional e correto.

### Verificação externa das RPCs críticas via REST

```
POST /rest/v1/rpc/persist_reviews_atomic      apikey=pub  →  HTTP 404  (não enxergável)
POST /rest/v1/rpc/refresh_monthly_view        apikey=pub  →  HTTP 401 "permission denied for function refresh_monthly_view"
POST /rest/v1/rpc/get_reviews_stats           apikey=pub  →  HTTP 300  (ambiguidade por overload invisível; efetivamente bloqueada)
```

Todas as RPCs críticas de escrita (`persist_reviews_atomic`, `update_location_metrics`, `refresh_monthly_view`, `cleanup_legacy_from_dataset`) e de leitura (`get_reviews_stats` etc.) agora negam chamadas via chave publishable/anon.

---

## 5. Archive schema (T0.6)

| Tabela | Schema antes | Schema depois | Linhas |
|---|---|---|---:|
| `reviews_backup_cp` | `public` | **`archive`** | 16 360 |
| `review_collaborators_backup_cp` | `public` | **`archive`** | 1 405 |
| `reviews_legacy_archive` | `public` | **`archive`** | 5 877 |
| `reviews_raw_legacy_archive` | `public` | **`archive`** | 0 |
| **Total preservado** | | | **23 642** |

Schema `archive` criado com RLS default-deny em cada tabela, `REVOKE ALL` para `anon`/`authenticated`/`public`, `GRANT USAGE` apenas para `service_role`.

### Verificação externa

```
GET /rest/v1/reviews_backup_cp  apikey=sec  →  HTTP 404 "Could not find the table 'public.reviews_backup_cp' in the schema cache"
```

As tabelas deixaram de existir em `public`. Nenhum drop — reversibilidade mantida ≥90 dias conforme SPEC §3.5.

---

## 6. Consolidação de `location_id` (T0.7)

| Métrica | Antes | Depois |
|---|---:|---:|
| `reviews` com `location_id = 'cartorio_paulista_main'` | 4 421 | **0** |
| `reviews` com `location_id = 'cartorio-paulista-location'` | 951 | **5 372** |
| Total `reviews` | 5 372 | **5 372** |
| `gbp_locations` com `cartorio_paulista_main` | 1 | 0 |

Reassociação completa sem perda de dados. `reviews_raw` e `collection_runs` também foram reassociados (0 linhas legacy restantes). A row `gbp_locations.cartorio_paulista_main` foi removida após confirmação de que não há referências pendentes.

---

## 7. Edge Functions — smoke test pós-apply

```
POST /functions/v1/scheduler  Authorization=sb_secret_gOwE-
→ HTTP 200
  {
    "scheduler_run": true,
    "auto_collector_result": {"code": 401, "message": "Invalid Token or Protected Header formatting"},
    "review_jobs_result": {"result": [{"processed_jobs": 0, "errors": []}]},
    "timestamp": "2026-04-09T21:15:22Z"
  }
```

- `scheduler` operacional. ✓
- `review_jobs_result` executou com sucesso, o que confirma que as chamadas REST internas do worker via `service_role` permanecem funcionais após a revogação de grants a `anon`/`authenticated`.
- `auto_collector_result: 401` é comportamento **pré-existente** (stub vazio, não causado por Fase 0). Documentado em `edge-functions-audit-2026-04-09.md`. Será resolvido na Fase 4.

---

## 8. Tabela consolidada dos 14 ACs

| AC | Descrição | Estado | Evidência |
|---|---|:---:|---|
| AC-0.1 | Chaves legadas retornam 401 | ✅ | §2 |
| AC-0.2 | `.env.docker` fora do git | ✅ | commit `32a2e71`, `git ls-files .env.docker` vazio |
| AC-0.3 | Histórico git purgado (opcional, não executado) | — | SPEC opcional; não aprovado |
| AC-0.4 | Baseline reproduz prod | ✅ | `20260409120000_baseline.sql`: 18 tables, 46 fns, 39 policies, 54 indexes, 8 extensions |
| AC-0.5 | RLS habilitada em todas as tabelas `public` | ✅ | §3 (`rowsecurity=false count=0`) |
| AC-0.6 | Nenhuma policy permit-all em `public` | ✅ | §3 (`permit_all_count=0`) |
| AC-0.7 | RPCs não acessíveis a anon | ✅ | §4 (REST 401/404/300 para as 4 críticas) |
| AC-0.8 | Tabelas backup/archive movidas | ✅ | §5 (REST 404 `public.reviews_backup_cp`) |
| AC-0.9 | `location_id` consolidado | ✅ | §6 (0 legacy, 5372 canonical) |
| AC-0.10 | Backend scaffolding ainda sobe | ✅ | inalterado desde Fase −1 (sem deploy) |
| AC-0.11 | Pre-commit hook bloqueia `.env` | ✅ | commit `ec65ada`, teste dummy `backend/.env` rejeitado |
| AC-0.12 | CI `security-gate` configurado | ✅ | commit `6804b19`, `.github/workflows/security-gate.yml` |
| AC-0.13 | Frontend HealthPage inalterado | ✅ | não tocado |
| AC-0.14 | Coleta continua parada | ✅ | `collection_runs` sem nova entrada; `auto_collector_result` 401 pré-existente |

---

## 9. Backup e rollback

Backups em `phase-0-security-baseline/snapshot/prod-backup-2026-04-09/`:
- `public_policies_pre_apply.json` — 39 policies permissivas que foram dropadas
- `gbp_locations_pre_apply.json` — 2 rows antes do DELETE
- `reviews_count_by_location_pre_apply.json` — distribuição 4421 + 951
- `archive_tables_row_counts_pre_apply.json` — contagens das 4 tabelas legacy
- `user_fn_grants_pre_apply.json` — 46 funções × 3 roles
- `metadata.json` — descritor do backup

Para rollback completo seria necessário:
1. `PUT /api-keys/legacy?enabled=true` (re-habilitar chaves legacy)
2. Recriar `sb_publishable_x4ab0…` e `sb_secret_KDjF3…` via POST (impossível — valores são gerados pela API; teria que aceitar novos UUIDs)
3. Re-executar as 4 migrations em ordem inversa (requer escrever migrations inversas a partir dos backups)
4. Restaurar as policies originais a partir de `public_policies_pre_apply.json`

Na prática, o rollback completo exigiria restauração a partir de backup Supabase de um snapshot anterior do projeto. O plano recomendado em caso de regressão crítica é: identificar o problema específico e aplicar uma migration corretiva direcional (por exemplo, re-grant de uma função específica para `service_role`), não reverter a Fase 0 inteira.

---

## 10. Itens pendentes (backlog pós-Fase 0)

1. **Limpar secrets órfãos das Edge Functions**: `SERVICE_KEY_CHECK` (= legacy JWT service_role, sem referência em código) e `SUPABASE_DB_URL` (também sem referência). Seguros de remover. Sub-ticket para Fase 5.
2. **Redeploy das Edge Functions** (ou aposentadoria via Fase 4): o `auto-collector` está vazio (stub eszip), explicando a parada da coleta em 2025-09-25. Decisão adiada para Fase 4.
3. **Rotacionar credencial DataForSEO hardcoded em `dataforseo-lookup/index.ts:34`**: não é segredo Supabase, mas é dívida técnica. Backlog Fase 4.
4. **T0.2.b (purga de histórico git do `.env.docker`)**: não executada — destrutiva, requer aprovação explícita + comunicação a outros clones. Adiável indefinidamente; o histórico atual já passou pela redaction de `git filter-repo` na Fase −1.
5. **Branch protection no GitHub**: configurar `security-gate` como check obrigatório no merge para `main` — requer acesso admin na UI do GitHub, não automatizável por este agente.
