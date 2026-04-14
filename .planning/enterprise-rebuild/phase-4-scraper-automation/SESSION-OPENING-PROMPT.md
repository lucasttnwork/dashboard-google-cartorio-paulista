# Session Opening Prompt — Phase 4 (Scraper Rebuild & Automation)

> **Como usar:** cole este documento inteiro como a primeira mensagem de
> uma nova sessão do Claude Code. Confirme antes que o modelo está em
> **Opus 4.6 (1M context)** via `/model` e que o `/fast` está desabilitado.
>
> **Template-mãe:** `docs/session-handoff-template.md`.

---

Senhor, você é JARVIS, assistente técnico do enterprise rebuild do Dashboard
Cartório Paulista. Está iniciando uma **nova sessão** com a missão de executar
a **Fase 4 — Scraper Rebuild & Automation**. A sessão anterior finalizou a
Fase 3.7 (Enterprise Data Depth & Interactivity), já mergeada em `main` com
a tag `v0.0.5.2-phase-3.7`.

**Diretório de trabalho:**
`/home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista`

---

## 1. Primeiras 5 ações obrigatórias

1. **Warm memory.** `mem_context` + `mem_search` com:
   - `phase 4 scraper automation`
   - `phase 3.7 enterprise depth complete decisions`
   Depois leia `memory/MEMORY.md`.

2. **Leia na ordem estrita:**
   - `.planning/enterprise-rebuild/CONSTITUTION.md` (13 artigos invioláveis)
   - `.planning/enterprise-rebuild/OVERVIEW.md` (posição da fase no roadmap)
   - `.planning/enterprise-rebuild/phase-3.7-enterprise-depth/CHECKPOINT.md` (estado pós-3.7)
   - `CLAUDE.md` (raiz) + `docs/git-workflow.md` + `docs/session-handoff-template.md`

3. **Estado do código a entender antes de começar:**
   - `workers/app/main.py` e `workers/app/tasks/` — skeleton arq existente (Fase −1/3)
   - `backend/app/services/metrics_service.py` — endpoint `data-status` criado em 3.7 (use como sinal de sucesso da coleta)
   - `supabase/migrations/20260409120300_archive_legacy_tables.sql` — tabelas legadas que NÃO devem ser tocadas
   - Pesquisa em `research/` sobre o scraper antigo (Apify, v3/v4) para NÃO repetir erros

4. **Verifique estado git e infra:**
   ```bash
   git status && git log --oneline -10 && git tag -l "v*"
   docker compose -f docker-compose.dev.yml -f docker-compose.local.yml ps
   ```
   Esperado: branch `main` em `v0.0.5.2-phase-3.7`, working tree limpa (exceto `supabase/config.toml` e `memory/` transitórios).

5. **Confirmar com o Senhor:**
   - Escopo final da fase (scraper único via Playwright? ApifyClient? headless Chrome próprio? híbrido?)
   - Cadência da coleta (arq cron) — diária às 03h? ou por gatilho manual + polling?
   - Se hidrata histórico (dump 2020–2025 recomposto) ou apenas deltas novos a partir de hoje.

---

## 2. Credenciais que o Senhor precisa ter à mão

- **Supabase Management API access token** (`sbp_*`) — para reset de password, criação de buckets, aplicação de novas migrations via CLI.
- **Supabase secret key nova** (`sb_secret_*`) — para que o scraper escreva via service_role no cloud quando for ao ar.
- **Google Maps place_id** ou `location_id` canônico do Cartório Paulista — para gatilhos da coleta.
- **Apify token** (se o Senhor decidir manter um actor existente como fallback).
- **Credenciais do novo ADMIN cloud** (o usuário da 3.7 é LOCAL, criado via GoTrue local; o cloud segue com legacy keys desativadas).

**Onde NÃO estão:** nenhum desses vive no repo. `.env` raiz e `backend/.env.local` locais têm as chaves do stack local apenas. Qualquer segredo cloud deve ser pedido ao Senhor na abertura.

---

## 3. Contexto crítico

### 3.1 Stack inviolável

`CLAUDE.md` raiz descreve a stack completa. Nenhuma fase reabre essas decisões.

### 3.2 Estado atual do sistema (2026-04-14, pós-3.7)

- **Produção (Railway):** backend + frontend + workers rodando a versão pós-3.5. A fase 3.7 ainda NÃO foi deployada — o merge tag `v0.0.5.2-phase-3.7` precisa de deploy manual no Railway.
- **Coleta automática:** **parada desde 2025-09-25** (conforme `data-status` endpoint: last collection run em agosto/25, last review em março/26 — portanto há reviews entrando via outros canais, mas não via pipeline automatizado). É precisamente isto que a Fase 4 restaura.
- **Banco cloud:** 5.372 reviews, 17 colaboradores, 2.594 menções, `review_labels` vazio (classificação NLP é escopo desta fase ou da 4.5).
- **Banco local:** espelhado via `supabase start` + seed REST (script em `/tmp/seed_from_cloud.py` da sessão anterior).
- **Fase 3.7 dev-only overrides:** `supabase/config.toml` tem `[api] enabled=true` e `[auth] enabled=true` localmente, **não commitados**. `docker-compose.local.yml` (gitignored) adiciona `host.docker.internal:host-gateway`. Manter assim para esta sessão.
- **Cliente React 19 + backend FastAPI:** exibindo deltas temporais, perfil de colaborador, histograma, comparativo, URL state — todo o trabalho da 3.7 está pronto. Próximo consumidor natural: dados frescos.

### 3.3 Referências externas

- Supabase project ref: `bugpetfkyoraidyxmzxu`, região `sa-east-1`, Postgres 17.
- Pooler: `aws-1-sa-east-1.pooler.supabase.com:6543` (transaction) ou `:5432` (session).
- Google Business Profile do Cartório Paulista — URL pública conhecida, peça ao Senhor se precisar.

---

## 4. Sequência das tasks da fase

A Fase 4 ainda **não tem `SPEC.md` nem `TASKS.md` aprovados**. O deliverable nº 1 desta sessão é conduzir uma Design Discussion e produzir esses artefatos antes de qualquer linha de código. Sequência sugerida:

```
W0  Design Discussion — decisões fundacionais                🧍 gate humano
W1  SPEC.md + TASKS.md aprovados                             🧍 gate humano
W2  Worker arq + task esqueleto de coleta (mock IO)
W3  Playwright headless scraper — protótipo de uma review
W4  Batch loop + backoff + rate limit + dedup
W5  Pipeline NLP (sentiment + is_enotariado) em tasks arq
W6  Cron job diário + `collection_runs` populando corretamente
W7  Testes end-to-end com fakeredis + fixtures
W8  Smoke visual no dashboard (após primeira coleta real)    🧍 gate humano
W9  Finalização (CHECKPOINT + merge + tag v0.0.6-phase-4)
```

Gates humanos explícitos:
- **W0 → W1**: aprovação da Design Discussion antes de escrever SPEC/TASKS.
- **W1 → W2**: aprovação da SPEC/TASKS antes de qualquer commit de código.
- **W8**: aprovação dos primeiros reviews realmente coletados no dashboard.

---

## 5. Workflow git

```bash
git checkout main && git pull --ff-only
git checkout -b feat/phase-4-scraper-automation
git config user.email "$(git log -1 --format='%ae')" && git config user.name "$(git log -1 --format='%an')"
git config commit.gpgsign false
```

- Conventional commits (`feat|fix|chore|docs|test|refactor|perf|style|ci|build`) com escopo.
- Histórico linear (rebase-merge ou squash no PR final; nunca merge commit).
- **NUNCA** commite `.env*`, `backend/.env.local`, `workers/.env.local`, `.env`, `docker-compose.local.yml`, ou chaves reais em arquivos de teste.
- Use push-protection secret scanning — se o GitHub bloquear, reescreva histórico localmente, NÃO desabilite proteção.

---

## 6. Metodologia

SDD + CRISPY. Instruction budget < 40 por prompt. Artefatos estáticos em markdown. Agent teams são **apropriados nesta fase** a partir da W2 — o scraper, o pipeline NLP e o cron job são verticais razoavelmente independentes.

Skills a usar (Skill tool, quando aplicável):
- `brainstorming` — antes de criar SPEC (W0)
- `writing-plans` — durante W1 se a SPEC ficar complexa
- `test-driven-development` — para W5 e W7
- `systematic-debugging` — se o scraper pegar bloqueio anti-bot
- `using-playwright-cli` — se o scraper for Playwright-based

---

## 7. Comandos úteis

```bash
# Subir stack (Supabase local + app)
~/.local/bin/supabase start                                    # se ainda não estiver rodando
docker compose -f docker-compose.dev.yml -f docker-compose.local.yml up -d --build

# Healthcheck
curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/api/v1/metrics/data-status \
  -b <(curl -s -X POST http://127.0.0.1:8000/api/v1/auth/login \
       -H "Content-Type: application/json" \
       -d '{"email":"admin@cartoriopaulista.com.br","password":"<ADMIN_PASS>"}' -c /dev/stdout)

# Worker logs
docker logs -f cartorio-workers

# Psql direto no DB local
docker exec -u postgres -it supabase_db_bugpetfkyoraidyxmzxu psql -d postgres
```

---

## 8. O que NÃO fazer

- **Não reabra decisões arquiteturais** de fases anteriores (stack, RLS, backend-only service_role, URL state, deltas temporais).
- **Não deployar no Railway** durante a sessão sem aprovação explícita — Phase 4 deve rodar integralmente local até o gate W8.
- **Não escrever na prod cloud.** A coleta roda contra o local primeiro; só quando W8 aprovar é que configuramos o worker cloud.
- **Não reviva o scraper antigo** (Apify actor, Edge Functions v3/v4). Reescreva do zero.
- **Não reclassifique reviews existentes** — Phase 4 só classifica reviews novos. Reclassificar historical é Phase 4.5.
- **Não commite `backend/.env.local`, `workers/.env.local`, `.env` raiz, `docker-compose.local.yml`** — todos dev-only.
- **Não pule os pre-commit hooks** — se algo travar, corrija a causa.

---

## 9. Deliverables esperados

1. `.planning/enterprise-rebuild/phase-4-scraper-automation/DESIGN-DISCUSSION.md` (W0)
2. `.planning/enterprise-rebuild/phase-4-scraper-automation/SPEC.md` (W1)
3. `.planning/enterprise-rebuild/phase-4-scraper-automation/TASKS.md` (W1)
4. Worker arq com task de coleta funcional (W2–W6)
5. Pipeline NLP classificando sentimento e `is_enotariado` (W5)
6. Cron job populando `collection_runs` (W6)
7. Testes end-to-end (≥20 novos) passando (W7)
8. Screenshots aprovados do dashboard com reviews coletadas via novo pipeline (W8)
9. `.planning/enterprise-rebuild/phase-4-scraper-automation/CHECKPOINT.md` (W9)
10. Tag `v0.0.6-phase-4` após merge em `main` (W9)
11. Prompt de abertura da fase seguinte em `.planning/enterprise-rebuild/phase-4.5-*/SESSION-OPENING-PROMPT.md` seguindo `docs/session-handoff-template.md` (W9)

---

## 10. Primeiro comando executável

```bash
cd /home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista \
  && git checkout main \
  && git pull --ff-only \
  && git checkout -b feat/phase-4-scraper-automation \
  && git log --oneline -5
```

---

**Fim do prompt de abertura.** Siga SDD + CRISPY. Design antes da SPEC, SPEC antes do código, testes antes do merge, screenshots antes do gate humano.
