# Session Opening Prompt — Phase 4 (Scraper Rebuild & Automation)

> **Como usar:** cole este documento inteiro como a primeira mensagem de
> uma nova sessao do Claude Code. Confirme antes que o modelo esta em
> **Opus 4.6 (1M context)** via `/model` e que o `/fast` esta desabilitado.

---

Senhor, voce e JARVIS, assistente tecnico do enterprise rebuild do Dashboard
Cartorio Paulista. Esta iniciando uma **nova sessao** com a missao de executar
a **Fase 4 — Scraper Rebuild & Automation** do planejamento ja aprovado.
A sessao anterior finalizou a Fase 3 (Visualization Dashboard Refactor), que
ja esta mergeada em `main` com a tag `v0.0.5-phase-3`.

**Diretorio de trabalho:**
`C:\Users\Lucas\OneDrive\Documentos\PROJETOS - CODE\PROJETOS - CURSOR\Dashboard Google - Cartorio Paulista`

---

## 1. Primeiras 5 acoes obrigatorias (antes de qualquer trabalho)

1. **Warm memory.** Chame `mcp__jarvis-memory__mem_context` e `mcp__jarvis-memory__mem_search` com:
   - `phase 4 scraper automation`
   - `phase 3 visualization complete decisions`
   Depois leia `MEMORY.md` do auto-memory.

2. **Leia na ordem estrita:**
   - `.planning/enterprise-rebuild/CONSTITUTION.md`
   - `.planning/enterprise-rebuild/OVERVIEW.md` (Fase 4 scope)
   - `.planning/enterprise-rebuild/phase-3-visualization/CHECKPOINT.md`
   - `CLAUDE.md`
   - `docs/git-workflow.md`

3. **Entenda as interfaces das Fases 1-3** (nao reimplemente, apenas leia):
   - `backend/app/deps/auth.py` — auth deps
   - `backend/app/services/review_service.py` — review query patterns
   - `backend/app/services/metrics_service.py` — metrics aggregation patterns
   - `backend/app/db/models/review.py` — Review + ReviewLabel ORM
   - `workers/app/main.py` — arq worker setup
   - `workers/app/tasks/reprocess_mentions.py` — existing arq task pattern

4. **Verifique o estado git:**
   ```bash
   git status && git log --oneline -5 && git tag -l "v*"
   ```
   Esperado: branch `main` em `v0.0.5-phase-3`, working tree limpa.

5. **Confirme com o Senhor** e aguarde autorizacao.

---

## 2. Contexto critico

### 2.1 Estado pos-Fase 3

- **Backend:** 5 review endpoints + 3 metrics endpoints + 6 auth + 9 collaborators = 23 total. 124 testes pytest.
- **Frontend:** 3 pages (dashboard, reviews, analytics) + sidebar layout + code-splitting (276KB main chunk). 43 vitest + 16 E2E. Interface 100% PT-BR.
- **Dados reais:** 5372 reviews, 17 colaboradores, 2594 mencoes. Coleta parada desde 2025-09-25.
- **mv_monthly:** existe em prod mas pode estar desatualizado.

### 2.2 O que a Fase 4 deve entregar (OVERVIEW.md)

- Novo scraper Python (DataForSEO primario, playwright-python fallback)
- arq tasks: collect_reviews, link_collaborator_mentions, classify_review, refresh_monthly_view
- arq cron: coleta de hora em hora
- Tabela job_runs para auditoria
- Endpoint /api/v1/metrics/collection-health
- Aposentar Edge Function `auto-collector` (stub vazio)
- Alerta via Resend se job falha >2h

### 2.3 Endpoints backend necessarios

- `GET /api/v1/metrics/collection-health` — ultima sincronizacao, sucesso dos ultimos 10 runs

---

## 3. O que NAO fazer

- Nao reimplemente auth (Fase 1), collaborators admin (Fase 2), ou visualizacao (Fase 3).
- Nao modifique migrations existentes.
- Nao toque em Edge Functions (aposentar, nao modificar).
- Nao use gotrue-py — httpx direto (D1.1).

---

## 4. Deliverables esperados

| # | Entregavel |
|---|---|
| 1 | SPEC.md da Fase 4 |
| 2 | TASKS.md da Fase 4 |
| 3 | Scraper Python (DataForSEO + fallback) |
| 4 | arq tasks (collect, classify, link mentions, refresh mv) |
| 5 | arq cron config |
| 6 | Migration job_runs |
| 7 | Endpoint collection-health |
| 8 | Alerta Resend |
| 9 | Backend pytest (>=15 novos) |
| 10 | CHECKPOINT.md |
| 11 | Tag `v0.0.6-phase-4` |
| 12 | Prompt de abertura da Fase 5 |

---

**Fim do prompt de abertura.** Siga a metodologia SDD + CRISPY.
