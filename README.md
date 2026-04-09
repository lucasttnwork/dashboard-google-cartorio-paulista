# Dashboard Google — Cartório Paulista

Sistema enterprise de monitoramento e análise de avaliações do Google Business Profile para o Cartório Paulista. Plataforma containerizada em Railway, com FastAPI como BFF, workers arq para coleta automatizada, e frontend Vite/React acessando o banco exclusivamente através do backend autenticado.

> **Status (2026-04-09):** reestruturação enterprise em andamento. Fase ativa: **−1 (Cleanup & Architectural Pivot)**. Ver `.planning/enterprise-rebuild/OVERVIEW.md` para roadmap completo.

---

## Stack

| Camada | Tecnologia | Container |
|---|---|---|
| Frontend | Vite 6 + React 19 + TypeScript + Tailwind v4 + shadcn/ui + TanStack Query | `nginx:alpine` |
| Backend | FastAPI + SQLAlchemy 2 async + Pydantic v2 + structlog | `python:3.12-slim` (uvicorn) |
| Workers | arq (Redis queue) + cron built-in + health server | `python:3.12-slim` |
| Queue | Redis 7 | Railway addon |
| Database | Supabase Postgres 16 (plano Free) | — |
| Auth | Supabase Auth (IdP) + backend relay (cookie httpOnly) | — |
| Deploy | Railway (4 serviços) | Docker |

## Estrutura do repositório

```
.
├── .planning/enterprise-rebuild/  # SDD + CRISPY — ler antes de qualquer mudança
│   ├── CONSTITUTION.md            # 13 artigos invioláveis
│   ├── OVERVIEW.md                # roadmap das 7 fases
│   ├── DESIGN-DISCUSSION.md       # 18 decisões técnicas
│   ├── OPEN-QUESTIONS.md
│   ├── research/                  # auditoria e inventário
│   ├── phase-minus-1-cleanup/
│   ├── phase-0-security-baseline/
│   └── legacy-snapshot/           # código antigo arquivado em tarballs
├── frontend/                      # Vite + React SPA
├── backend/                       # FastAPI BFF
├── workers/                       # arq worker + health server
├── supabase/
│   ├── migrations/                # SQL versionado (populado na Fase 0)
│   └── config.toml
├── docs/                          # documentação técnica
├── .github/workflows/             # CI/CD (populado na Fase 0/5)
├── docker-compose.dev.yml         # desenvolvimento local dos 4 serviços
├── railway.json                   # declaração de deploy
├── CLAUDE.md                      # instruções para o agente
└── README.md
```

## Rodando localmente

Requer **Docker 24+** e **docker compose v2**.

> **Setup inicial (uma vez por clone):** ative os git hooks versionados do repositório executando `git config core.hooksPath .githooks`. Isso habilita o `pre-commit` que bloqueia o commit acidental de arquivos `.env*` contendo segredos.

```bash
# Clonar e entrar no diretório
git clone <repo-url>
cd "Dashboard Google - Cartório Paulista"

# Ativar os git hooks do repositório (uma única vez)
git config core.hooksPath .githooks

# Copiar templates de env e editar com segredos locais
cp backend/.env.example backend/.env.local
cp workers/.env.example workers/.env.local
cp frontend/.env.example frontend/.env.local

# Subir os quatro serviços
docker compose -f docker-compose.dev.yml up --build
```

Serviços disponíveis após startup:

| Serviço | URL | Healthcheck |
|---|---|---|
| Frontend | http://localhost:3000 | GET `/` |
| Backend | http://localhost:8000 | GET `/health`, `/api/v1/health` |
| Workers | http://localhost:9000 | GET `/health` |
| Redis | localhost:6379 | `redis-cli ping` |

## Desenvolvimento

### Backend
```bash
cd backend
uv pip install -e .[dev]    # ou pip install -e .[dev]
uvicorn app.main:app --reload
pytest -q
ruff check .
mypy app
```

### Workers
```bash
cd workers
uv pip install -e .[dev]
python -m app.main           # sobe arq worker + health server
pytest -q
```

### Frontend
```bash
cd frontend
npm install
npm run dev                  # Vite dev server
npm run build
npm run test                 # vitest
npm run lint
```

## Convenções

- **Commits:** inglês, Conventional Commits (`feat|fix|chore|docs|test|refactor|perf|style|ci|build`). Exemplos: `feat(backend): add auth middleware`, `chore(deps): bump vitest to 3.0`.
- **Branches:** GitHub Flow com histórico linear. `feature/*`, `fix/*`, `chore/*` a partir de `main`, PR de volta. Ver [`docs/git-workflow.md`](docs/git-workflow.md) para o guia completo.
- **Specs e docs de planejamento:** português brasileiro formal em `.planning/`.
- **Código-fonte:** inglês.
- **Secrets:** jamais commitados. `.env*` gitignorados (exceto `.env.example`).
- **Migrations:** `supabase/migrations/YYYYMMDDHHMMSS_snake_case.sql`. Aplicadas via Supabase CLI.

## Estado da reestruturação

| Fase | Nome | Status |
|---|---|---|
| −1 | Cleanup & Architectural Pivot | ✅ done (tag `v0.0.1-phase-minus-1`) |
| 0 | Security Baseline | 🔜 próxima |
| 1 | Auth & Backend BFF | spec a escrever após 0 |
| 2 | Collaborators Admin Panel | após 1 |
| 3 | Visualization Dashboard Refactor | após 1 |
| 4 | Scraper Rebuild & Automation | após 1 |
| 5 | Observability & Hardening | após as demais |

O código legado (Next.js frontend, scraper Node, Edge Functions) está arquivado em `.planning/enterprise-rebuild/legacy-snapshot/` como tarballs recuperáveis.

## Segurança

- Frontend **nunca** faz consultas diretas ao Supabase. Todo acesso passa pelo backend FastAPI.
- `service_role` do Supabase existe **apenas** em variáveis de ambiente do backend/workers.
- Tokens de sessão são emitidos como cookies `httpOnly; Secure; SameSite=Lax`.
- RLS habilitada com default-deny em todas as tabelas.
- Rotação de credenciais: ver `.planning/enterprise-rebuild/phase-0-security-baseline/SPEC.md`.

## Metodologia

Spec-Driven Development (SDD) + CRISPY. Planejamento vertical com gates humanos. Artefatos estáticos em markdown como memória compartilhada. Ver `.planning/enterprise-rebuild/` para os detalhes completos.

## Licença

Proprietário. Uso interno do Cartório Paulista.
