# Agent Instructions

Este projeto é um Dashboard de monitoramento de reviews do Google Business Profile para o Cartório Paulista, rodando em containers Railway com Supabase como banco de dados.

## Stack

- **frontend/** — Vite 6 + React 19 + TypeScript 5 + Tailwind v4 + shadcn/ui. Servido por `nginx:alpine` em container.
- **backend/** — FastAPI + SQLAlchemy 2 async + Pydantic v2. Uvicorn em container Python 3.12.
- **workers/** — arq (async Redis queue) + cron built-in + health server. Container Python 3.12.
- **redis** — Railway addon (desenvolvimento local via `docker-compose.dev.yml`).
- **supabase/** — apenas `migrations/` SQL versionadas. Postgres 16 + Supabase Auth como IdP. Plano Free.
- **.planning/enterprise-rebuild/** — spec-driven development docs. **LEIA `OVERVIEW.md` ao iniciar qualquer sessão.**

## Princípios operacionais

1. **Segurança primeiro.** `service_role` só no backend/workers. Frontend nunca fala com Supabase direto — tudo passa pelo BFF FastAPI.
2. **RLS sempre habilitada** com default-deny. Defesa em profundidade.
3. **Migrations versionadas** em `supabase/migrations/` com prefixo `YYYYMMDDHHMMSS_snake_case.sql`. Zero alteração de schema fora do git.
4. **Observabilidade obrigatória.** `structlog` JSON em stdout, Sentry, Railway Logs, correlation ID propagado via `X-Request-ID`.
5. **Test-first** em caminhos críticos (auth, dados, regras de negócio). pytest+httpx (backend), pytest+fakeredis (workers), vitest+MSW (frontend), Playwright (E2E).
6. **Vertical planning.** Cada fase entrega algo testável end-to-end. Nunca "só a migration" ou "só a UI".

## Antes de qualquer mudança

1. Leia `.planning/enterprise-rebuild/CONSTITUTION.md` — 13 artigos invioláveis.
2. Leia `.planning/enterprise-rebuild/OVERVIEW.md` — fase atual e próxima.
3. Leia a SPEC e TASKS da fase ativa.
4. Confirme com o Senhor antes de operações destrutivas ou irreversíveis.

## Convenções

- **Idioma:** specs e planos em português brasileiro formal; código-fonte, commits e testes em inglês.
- **Commits:** atômicos por task. Padrão `<tipo>(<escopo>): <descrição>` (feat, fix, chore, docs, test, refactor).
- **Python:** PEP 8, `ruff` isort style, `mypy` strict, `from __future__ import annotations` em todos os módulos.
- **TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`, path alias `@/*` → `./src/*`.
- **Secrets:** nunca commitados. Vivem em `.env.local` (gitignored) por serviço ou em Railway Variables.

## Como rodar localmente

```bash
# Requer Docker 24+ e docker compose v2
docker compose -f docker-compose.dev.yml up --build
```

Serviços locais:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000 (`/health`, `/api/v1/health`)
- Workers: http://localhost:9000/health
- Redis: localhost:6379

## Metodologia

Spec-Driven Development (SDD) + CRISPY. Instruction budget < 40 por prompt. Artefatos estáticos em markdown como memória compartilhada. Human-in-the-loop nos gates marcados com 🧍 nas tasks.

Memória persistente via `jarvis-memory` MCP — ver `~/.claude/rules/memory-always.md`.
