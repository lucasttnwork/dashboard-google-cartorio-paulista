# Session Resume — Phase 4 Complete

**Congelado em:** 2026-04-20 ~21:15 local / 2026-04-21 00:15 UTC
**Próxima sessão:** ler este arquivo primeiro + `mem_context` + `mem_search "phase 4 production deploy"`

---

## TL;DR

Phase 4 (Scraper Rebuild & Automation) está **LIVE em produção** no Railway. Tag `v0.0.6-phase-4`. Cron disparou às 21/04 00:00 UTC, coletou 76 reviews novos via Apify, Gemini analisou sentiment + mentions. Tudo funcionando.

---

## Como retomar

1. Ler `.planning/enterprise-rebuild/phase-4-scraper-automation/CHECKPOINT.md` (documento completo de handoff)
2. Ler `.planning/enterprise-rebuild/phase-4-scraper-automation/PRODUCTION-VERIFY-REPORT.md` (relatório E2E Playwright)
3. `git log --oneline -10` — HEAD deve ser `7e1c0b1`
4. `mem_search "phase 4 production deploy"` — busca memória persistente

---

## O que está pronto

- ✅ Apify collection automático (cron arq 2h seg-sex + 1x/dia fds)
- ✅ Dynamic fetch window (zero gaps nas transições de cadence)
- ✅ NLP via OpenRouter Gemini 2.5 Flash Lite
- ✅ Admin UI `/admin/collection-health`
- ✅ Railway deploy (3 services)
- ✅ GitHub auto-deploy configurado (push em main → auto-deploy)
- ✅ Produção validada via Playwright (8/8 pages)
- ✅ Cron real executou (run id=21 no cloud DB)

---

## Follow-ups pendentes (cosméticos)

1. **DatasetUploadPage:** missing pt-BR diacritics ("Avaliacoes" → "Avaliações")
2. **Data freshness indicator:** sidebar não atualiza post-collection (mostra 08/abr enquanto há reviews de 21/04)

Arquivos relevantes:
- `frontend/src/pages/admin/DatasetUploadPage.tsx`
- `backend/app/api/v1/metrics.py` (endpoint data-status provavelmente)
- `frontend/src/components/layout/AppLayout.tsx` (sidebar badge)

---

## Decisão do usuário pendente

Perguntei se quer fixar os 2 follow-ups agora ou marcar como backlog. Sessão foi reiniciada antes da resposta.

**Opções após clear:**
- A) Fixar os 2 follow-ups (~30min)
- B) Phase 4.5 — reclassificação NLP batch dos 6.089 reviews históricos
- C) Phase 5 — Observability + Runbooks + LGPD hardening
- D) Outra direção

---

## Estado git

```
7e1c0b1 feat(workers): dynamic fetch window — zero gaps across weekday/weekend
b1310c7 fix(phase-4): review blocker fixes — CHECK constraints, schema refs, trailing slash
b1c37ae fix(workers): parse ISO dates in transform + correct language to pt-BR
710fc5c fix(workers): correct column names for cloud schema + pgbouncer statement_cache
383543b merge(phase-4): collection health monitoring UI (T10-T12)
9783ab1 merge(phase-4): collection pipeline + NLP analysis (T1-T9)
```

Branch: `main`. Tag: `v0.0.6-phase-4`. Pushed to origin.

---

## Estado Railway produção

| Service | URL | GitHub auto-deploy |
|---|---|---|
| frontend | https://frontend-production-3749.up.railway.app | main → /frontend |
| backend | https://backend-production-04ffb.up.railway.app | main → /backend |
| workers | internal | main → /workers |

Worker env vars (Railway): APIFY_TOKEN, OPENROUTER_API_KEY, GOOGLE_PLACE_URL, COLLECTION_ENABLED=true, COLLECTION_WINDOW_HOURS=3, NLP_CONFIDENCE_THRESHOLD=0.7.

---

## Docker local (ainda rodando)

4 containers ativos: cartorio-backend (:8000), cartorio-frontend (:3000), cartorio-workers (:9000), cartorio-redis (:6379). Config aponta para Supabase cloud (não local). Ctrl+C se quiser liberar memória: `docker compose -f docker-compose.dev.yml down`.

---

## Credenciais importantes (cloud)

- Admin email: `admin@cartoriopaulista.com.br`
- Admin senha: `Admin@CartorioPaulista2026`
- Supabase project ref: `bugpetfkyoraidyxmzxu`
- Supabase DB URL: vive em `.env` raiz (`SUPABASE_DATABASE_URL`) — pooler transaction mode porta 6543
- Railway access token: em `~/.railway/config.json`

APIs externas (keys vivem em `.env` raiz + workers/.env.local + Railway workers env — NUNCA no repo):
- Apify token (`APIFY_TOKEN`, começa com `apify_api_`)
- OpenRouter key (`OPENROUTER_API_KEY`, começa com `sk-or-v1-`)

---

## Gotchas aprendidas nesta sessão

1. **asyncpg + pgbouncer:** precisa `statement_cache_size=0` em `create_pool()`
2. **Apify language:** `pt-BR` não `pt`
3. **FastAPI 307 redirects:** sempre use trailing slash nas URLs frontend, senão nginx proxy perde port no Location header
4. **Cloud schema:** `collaborators.full_name` (não `name`), `collaborators.is_active` (não `active`), `reviews.review_id` é PK text (não `id`)
5. **asyncpg timestamptz:** passe datetime objects, não strings (mesmo com `::timestamptz` SQL cast)
6. **arq enqueue:** use `ctx['redis'].enqueue_job()`, não `ctx.get('enqueue')`
7. **collection_runs CHECK constraints:** run_type ∈ {manual, scheduled, webhook}, status ∈ {running, completed, failed}
8. **Railway CLI:** sem comando para GitHub source — usar GraphQL direto
9. **Worker spawn:** comandos UM POR VEZ (ccd → wait → /caveman ultra → wait → paste prompt → \r)
10. **Playwright MCP:** apenas 1 instância por profile — fechar browser da mother antes de spawnar worker Playwright
