# CHECKPOINT — Phase 4 (Scraper Rebuild & Automation)

**Status:** ✅ **COMPLETA E EM PRODUÇÃO**
**Data:** 2026-04-20
**Tag:** `v0.0.6-phase-4`
**HEAD main:** `7e1c0b1`

---

## §1 Escopo entregue

| Componente | Status | Evidência prod |
|---|---|---|
| Apify collection (compass/Google-Maps-Reviews-Scraper) | ✅ | 76 reviews em 39.9s @ 21/04 00:00 UTC |
| NLP via OpenRouter/Gemini 2.5 Flash Lite | ✅ | 63 reviews analyzed, +48 Gemini mentions |
| Migration: sentiment + analyzed_at + confidence + excerpt + source | ✅ | Aplicada cloud |
| Cron arq (2h seg-sex + 1x/dia sáb-dom) | ✅ | Run id=21 completed scheduled |
| Dynamic fetch window (zero gaps) | ✅ | 8 tests cover weekday/weekend boundaries |
| Degradation auto-fallback | ✅ | 4 consecutive failures → skip + Redis key |
| Admin UI Collection Health page | ✅ | `/admin/collection-health` live em prod |
| Sidebar badge on failures | ✅ | Red dot when consecutive_failures ≥ 3 |
| Worker startup/shutdown hooks (asyncpg + httpx + ApifyClient) | ✅ | logs: apify=True db_pool=True |

---

## §2 Métricas

| Camada | Testes | Status |
|---|---|---|
| Workers (pytest) | 26/26 | ✅ |
| Frontend (vitest) | 112/112 | ✅ |
| Frontend (tsc) | clean | ✅ |
| Production E2E (Playwright via worker prod-verify) | 8/8 páginas | ✅ |

**DB state pós-deploy (2026-04-21 ~00:05 UTC):**
- Total reviews: **6.165** (+76 via coleta automática)
- Reviews com sentiment: **63** (Gemini Flash Lite)
- Gemini mentions: **2.959** (+48 linked via NLP)

**Custo por coleta:**
- Apify: $0.30/1000 reviews → ~$0.022 por run de 76 reviews
- OpenRouter Gemini: ~$0.00014/review → ~$0.011 por 76 reviews analyzed
- **Total estimado: ~$0.033 por run**

---

## §3 Commits

```
7e1c0b1 feat(workers): dynamic fetch window — zero gaps across weekday/weekend
b1310c7 fix(phase-4): review blocker fixes — CHECK constraints, schema refs, trailing slash
b1c37ae fix(workers): parse ISO dates in transform + correct language to pt-BR
710fc5c fix(workers): correct column names for cloud schema + pgbouncer statement_cache
383543b merge(phase-4): collection health monitoring UI (T10-T12)
9783ab1 merge(phase-4): collection pipeline + NLP analysis (T1-T9)
71f2738 feat(phase-4): collection health monitoring — T10-T12
d5212b7 feat(workers): implement Phase 4 collection pipeline + NLP analysis (T1-T9)
```

---

## §4 Railway Production State

| Service | URL | Status | GitHub auto-deploy |
|---|---|---|---|
| frontend | https://frontend-production-3749.up.railway.app | ✅ | ✅ main → /frontend |
| backend | https://backend-production-04ffb.up.railway.app | ✅ | ✅ main → /backend |
| workers | internal only | ✅ | ✅ main → /workers |
| Redis | addon | ✅ | — |

**Service IDs (GraphQL):**
- project: `b410fbce-b67d-4820-8906-846f705ae37c`
- env (production): `bbda7196-9ba1-42a2-9570-ca46281a3ae3`
- frontend: `4fa19de7-b763-461e-8673-7e67b171ac82`
- backend: `ccf479da-7015-48af-980f-312e68899a0b`
- workers: `d70e788c-96d5-40e5-8ed7-917a612f2d7f`

**Deployment triggers criados:**
- frontend: `6c2e0447-0b9a-497a-b6e2-2e8521796a44`
- backend: `cbbb9e15-779c-4cae-aa7d-f2825b0cce62`
- workers: `0340860b-df21-4198-82d9-717e08cdacc4`

**Worker env vars (Railway):**
- `APIFY_TOKEN` — set in Railway env
- `OPENROUTER_API_KEY` — set in Railway env
- `GOOGLE_PLACE_URL` (full URL com data= param)
- `COLLECTION_ENABLED=true`
- `COLLECTION_WINDOW_HOURS=3` (fallback — janela real é dinâmica)
- `NLP_CONFIDENCE_THRESHOLD=0.7`

---

## §5 Decisões autônomas registradas

### D1 — Dynamic fetch window ao invés de janela fixa 3h

Fixed window teria lacunas de ~41h/semana no fds (fri 22h→sat 8h=7h gap, sat 8h→sun 8h=21h gap, sun 8h→mon 0h=13h gap). Implementado `_compute_window_hours()` que consulta last successful run + 1h overlap, capped at 168h.

### D2 — `run_type='scheduled'` / `status='failed'` (CHECK constraint)

Worker-gerado "apify_auto" violava CHECK constraint `(manual|scheduled|webhook)`. Similar para `status='error'|'timeout'` vs `(running|completed|failed)`. Fix: mapear todos para valores permitidos.

### D3 — Review schema: PK é `review_id` (text), não `id`

analyze_review.py tentava `SELECT id FROM reviews` e INSERT usando subquery numérica — ambos falhavam. Reviews PK é `review_id` text, review_collaborators.review_id é text FK. Fix: usar review_id diretamente.

### D4 — Job enqueue via `ctx['redis'].enqueue_job()` (arq pattern)

Código original tentava `ctx.get('enqueue')` que não existia. arq injeta `ArqRedis` em `ctx['redis']` com método `.enqueue_job()`.

### D5 — Trailing slash em rotas FastAPI via frontend

FastAPI emite 307 redirect para adicionar trailing slash. nginx proxy passa o redirect mas o Location header perde o port mapping (retorna `http://localhost/...` em vez de `:3000/...`). Fix: SEMPRE incluir trailing slash nas URLs do apiClient.

### D6 — `statement_cache_size=0` obrigatório (pgbouncer transaction mode)

Supabase cloud via Transaction Pooler (port 6543) usa pgbouncer que não suporta prepared statements reutilizados. asyncpg default tenta preparar statements e falha com DuplicatePreparedStatementError. Fix: passar `statement_cache_size=0` em `create_pool()`.

### D7 — Apify language param = "pt-BR" (não "pt")

Actor rejeita "pt" bare. Valid values são "pt-BR", "pt-PT", etc.

### D8 — Transform parseia ISO dates para datetime

asyncpg não aceita string para colunas timestamptz mesmo com `::timestamptz` cast no SQL (tenta encodar antes de enviar). Fix: `_parse_iso()` converte ISO string → datetime UTC no transform.

### D9 — Backend env apontado para Supabase cloud (sem Supabase local)

Usuário decidiu não usar mais Supabase local. backend/.env.local agora tem cloud Transaction Pooler + `SUPABASE_JWT_HS_SECRET` (legacy HS256) para JWT validation (JWKS cloud retorna keys vazias).

### D10 — GitHub auto-deploy configurado via GraphQL

Railway CLI não expõe connection GitHub. Feito via GraphQL mutations:
1. `serviceInstanceUpdate` com `source.repo` + `rootDirectory`
2. `deploymentTriggerCreate` com `branch=main`, `provider=github`, `checkSuites=false`

Agora push em main → Railway auto-deploys os 3 serviços.

---

## §6 Follow-ups pendentes (cosméticos, não-bloqueantes)

1. **DatasetUploadPage sem diacríticos pt-BR**
   - Página usa "Avaliacoes", "Historico", "Importacoes", "sao"
   - Deveria: "Avaliações", "Histórico", "Importações", "São"
   - Escopo: fix string único componente frontend

2. **Data freshness indicator não refresca post-collection**
   - Sidebar mostra "Dados de 08 de abr / última sync 16/04 11:25"
   - Realidade: cron rodou 21/04 00:00 UTC, 76 reviews novos
   - Hipótese: endpoint `/metrics/data-status` cacheado ou usando MAX(create_time) em vez de MAX(last_seen_at)

---

## §7 Próximo wake-up da sessão

Após `/clear`, ler nesta ordem:

1. `.planning/enterprise-rebuild/phase-4-scraper-automation/CHECKPOINT.md` (este arquivo)
2. `.planning/enterprise-rebuild/phase-4-scraper-automation/PRODUCTION-VERIFY-REPORT.md` (relatório Playwright E2E)
3. `.orchestrator/STATE-PHASE-4.md`
4. `.planning/enterprise-rebuild/OVERVIEW.md` (visão geral)

Comando de warm-up:
```bash
cd /home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista
git log --oneline -10
git status
```

**Estado git esperado:**
- branch: main
- HEAD: `7e1c0b1`
- tag: `v0.0.6-phase-4`
- `.env`, `backend/.env.local`, `workers/.env.local`: não commitados (local only)

**Docker local:** 4 containers ainda rodando (cartorio-backend/frontend/workers/redis). Podem ser parados com `docker compose -f docker-compose.dev.yml down` se quiser liberar recursos.

**Próximo bloco sugerido:**
- Fix os 2 follow-ups cosméticos (~30min total)
- OU: começar Phase 4.5 (reclassificação NLP dos 6.089 reviews históricos via batch job)
- OU: começar Phase 5 (Observability + Hardening + Runbooks)

---

## §8 Checklist

- [x] SPEC + TASKS + DESIGN-DISCUSSION escritos e aprovados
- [x] 2 worktrees paralelos implementados (collection-nlp + admin-ui)
- [x] Code review hostile identificou 5 blockers → todos corrigidos
- [x] Merge clean em main
- [x] Tests pós-merge verdes (26 workers + 112 frontend)
- [x] Tag `v0.0.6-phase-4` criada e pushed
- [x] Worker + Backend + Frontend deployed em Railway
- [x] Phase 4 env vars configuradas no workers service
- [x] GitHub auto-deploy configurado (3 deployment triggers)
- [x] Produção validada via Playwright (8/8 pages)
- [x] Cron fired successfully em produção (run id=21)
- [x] NLP pipeline working E2E em produção (63 reviews analyzed)
- [x] CHECKPOINT congelado (este arquivo)
- [ ] Cosmetic follow-ups (pt-BR diacritics + data freshness indicator) — **deferred**
- [ ] Phase 4.5 SESSION-OPENING-PROMPT — **não escrito ainda**
