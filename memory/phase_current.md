---
name: Fase atual — Phase 4 pendente
description: Phase 3.7 (enterprise depth) entregue 2026-04-14; próximo trabalho é Phase 4 (scraper rebuild) — precisa de Design Discussion antes de qualquer código
type: project
---

Phase 3.7 — Enterprise Data Depth & Interactivity — **concluída em 2026-04-14**.

Tag `v0.0.5.2-phase-3.7`. Branch `feat/phase-3.7-enterprise-depth` mergeada em `main`.

## Entregue na Fase 3.7

9 capabilities (C1–C9 conforme SPEC §3):
- Delta temporal em todos os KPIs (Dashboard + perfil)
- Perfil individual de colaborador em `/collaborators/:id` para todos os roles
- Comparativo gráfico de até 4 colaboradores em Analytics (overlay)
- Histograma CSS de distribuição de ratings (sem biblioteca nova)
- Filtro de reviews por colaborador (multi-select, max 3)
- URLs com estado de filtros em Reviews e Analytics
- Taxa de resposta como 5º KPI no Dashboard + linha de tendência em Analytics
- Filtro por sentimento + modo compacto/expandido em Reviews
- Data freshness indicator global + date range picker customizado

Testes: backend 93 passed (+17), frontend 83 passed (+11). Zero regressão deliberada.

## Entregues paralelos dentro da fase (não planejados)

- `fix(db)` no baseline SQL: reordenação de 4 wrappers de função para aplicar em fresh Postgres 17 (pré-requisito para `supabase start` local funcionar).
- Hotfixes pós-W8: (a) `presetToDates` passa ambos endpoints para que o backend compute `previous_period` em preset mode; (b) `get_my_performance` normaliza UUID via `str()` para aceitar asyncpg nativo.

## Próxima fase — Phase 4 (Scraper Rebuild & Automation)

**Estado:** ainda sem SPEC/TASKS aprovados. Apenas o `SESSION-OPENING-PROMPT.md` foi atualizado no final da 3.7 para refletir o estado pós-entrega.

**Primeiro deliverable obrigatório da Fase 4:** Design Discussion (W0) antes de SPEC. Decisões fundacionais em aberto:
- Scraper único (Playwright local?) vs híbrido (Apify fallback + in-house)
- Cadência (daily cron 03h? ou on-demand via endpoint admin?)
- Hidratação do histórico vs. apenas deltas a partir de hoje
- Pipeline NLP como arq task síncrona após ingest ou separado

## Why / How to apply

**Why:** a janela de dados local (cloud também) tem artefato visível: `previous_period` fica zero porque a coleta parou em set/2025 enquanto `last_review` é março/2026. O cartório segue recebendo reviews pelo Google, mas o pipeline automatizado que puxava para o Postgres está parado há 6+ meses. Phase 4 restaura esse fluxo.

**How to apply:**
- Ao abrir a próxima sessão, cole integralmente o `SESSION-OPENING-PROMPT.md` da phase-4-scraper-automation como primeira mensagem.
- Verifique o CHECKPOINT da 3.7 para estado dos overrides dev-only (`supabase/config.toml` NÃO commitado, `docker-compose.local.yml` gitignored, `backend/.env.local` apontando para host.docker.internal).
- Endpoint `GET /api/v1/metrics/data-status` já existe (entregue em 3.7) — use-o como indicador de sucesso da coleta: `last_collection_run` deve começar a ser hoje após a Fase 4 rodar.
