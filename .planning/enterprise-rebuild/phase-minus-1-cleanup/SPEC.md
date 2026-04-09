# SPEC — Phase −1: Cleanup & Architectural Pivot

> Spec-level: brownfield / cleanup + scaffolding. Esta fase precede todas as outras e prepara o repositório para a nova stack Python/FastAPI/Railway. Template SDD.

---

## 0. Metadata

- **Fase:** −1 (primeira de todas)
- **Proprietário:** JARVIS + Senhor (aprovação final)
- **Status:** ready — todas as questões bloqueantes resolvidas
- **Pré-requisitos:** nenhum
- **Bloqueia:** Fase 0 (Security Baseline) depende desta

---

## 1. Objetivo

Deixar o repositório em um estado onde:

1. Só existe código que faz sentido na nova arquitetura (Vite frontend + FastAPI backend + arq workers + Supabase DB + Railway deploy).
2. O código legado (Next.js frontend, Node scrapers, Edge Functions runtime, docs decorativos) está arquivado de forma recuperável, não deletado por completo.
3. Os quatro containers (frontend, backend, workers, redis) existem como scaffolding mínimo funcional — cada um sobe local, responde healthcheck, mas ainda não tem lógica de negócio.
4. `docker-compose.dev.yml` roda os quatro localmente apontando para o Supabase cloud real (read-only enquanto a Fase 0 não rotaciona a segurança).
5. `railway.json` declara os serviços para deploy futuro.
6. `CLAUDE.md` e `README.md` refletem a arquitetura nova.
7. `.gitignore` cobre os artefatos novos (`frontend/dist/`, `backend/.venv/`, `workers/.venv/`, `*.env*`).

**Não faz parte desta fase:** rotacionar credenciais (Fase 0), habilitar RLS (Fase 0), implementar auth (Fase 1), migrar código de negócio do Next.js para o Vite (Fase 3), reconstruir scraper (Fase 4).

---

## 2. Comportamento Atual

Estado em 2026-04-09, após as ações iniciais desta sessão:

```
repo-root/
  .auto-claude/                          # worktrees antigos
  .planning/                              # novo, SDD (manter)
  archive/                                # conteúdo desconhecido (investigar)
  CLAUDE.md                               # 3-layer architecture (desatualizado)
  dashboard-frontend/                     # Next.js 15 (será arquivado)
  dataset_Google-Maps-Reviews-Scraper_2026-02-06_17-37-24-011.json   # dataset commitado
  dataset_Google-Maps-Reviews-Scraper_2026-03-04_12-32-36-128.json   # dataset commitado
  directives/                             # SOPs desatualizados
  docker-compose.yml                      # Docker antigo (frontend + scraper)
  DOCUMENTACAO_FUNCIONALIDADES_FLUXOS.md  # decorativo
  EXECUTE_ESTE_SQL.sql                    # hot-fix manual
  execution/                              # Python deterministic (triagem)
  google-maps-scraper-tool/               # JÁ DELETADO (2026-04-09)
  IMPLEMENTACAO_COMPLETA.md               # decorativo
  logs/                                   # gitignored OK
  node_modules/                           # raiz (não deveria existir)
  nul                                     # arquivo espúrio (rastro de Windows)
  package-lock.json                       # usado pelos scripts Node raiz
  package.json                            # scripts Node de ingestão
  railway-collector/                      # JÁ DELETADO (2026-04-09)
  README.md                               # desatualizado
  scraper/                                # Node+Playwright (arquivar)
  scripts/                                # Node orchestration (triagem)
  supabase/
    .temp/                                # CLI temp files (atualizados nesta sessão)
    functions/                            # Edge Functions (arquivar)
    sql/                                  # legado (portar em Fase 0)
    types.ts                              # auto-gerado
  tmp_apify_samples/                      # temp (limpar)
```

**Estado do git:**
- Dois arquivos `dataset_*.json` rastreados na raiz.
- `.env.docker` rastreado com chaves legadas (será tratado na Fase 0).
- `.planning/` ainda não commitado (novo).

---

## 3. Comportamento Alvo

### 3.1 Estrutura final da fase

```
repo-root/
  .github/workflows/                      # vazio por enquanto, Fase 0 adiciona
  .githooks/                              # vazio por enquanto, Fase 0 adiciona
  .planning/
    enterprise-rebuild/
      CONSTITUTION.md
      OVERVIEW.md
      DESIGN-DISCUSSION.md
      OPEN-QUESTIONS.md
      README.md
      research/
      legacy-snapshot/
        dashboard-frontend.tar.gz         # Next.js original comprimido
        scraper.tar.gz                    # scraper/ original comprimido
        supabase-functions.tar.gz         # Edge Functions original
        scripts.tar.gz                    # scripts/ Node raiz
        execution.tar.gz                  # execution/ Python
      legacy-docs-archive/
        RELATORIO_ANALISE_CRITICA_DASHBOARD.md
        IMPLEMENTACAO_COMPLETA.md
        DOCUMENTACAO_FUNCIONALIDADES_FLUXOS.md
      phase-minus-1-cleanup/
        SPEC.md                           # este arquivo
        TASKS.md
        CHECKPOINT.md                     # criado durante execução
      phase-0-security-baseline/
        SPEC.md
        TASKS.md
        snapshot/
          prod-state-2026-04-09.md
      (fases 1-5 criadas depois)

  frontend/
    src/
      main.tsx
      App.tsx
      routes.tsx                          # React Router stub
      pages/
        HealthPage.tsx                    # mostra status dos containers
      components/
        ui/                                # shadcn base (a ser populado na Fase 3)
      lib/
        api/
          client.ts                        # axios/fetch wrapper stub
    public/
    index.html
    vite.config.ts
    tsconfig.json
    tailwind.config.ts
    package.json
    nginx.conf
    Dockerfile
    .env.example
    .dockerignore

  backend/
    app/
      main.py                              # FastAPI app com /health
      core/
        config.py                          # pydantic Settings
        logging.py                         # structlog setup
      api/
        v1/
          __init__.py
          health.py                        # GET /health endpoint
      db/
        session.py                         # SQLAlchemy async engine
      deps/
        __init__.py
      __init__.py
    tests/
      test_health.py
    pyproject.toml
    Dockerfile
    .env.example
    .dockerignore

  workers/
    app/
      main.py                              # arq WorkerSettings
      settings.py
      tasks/
        __init__.py
        example.py                         # task stub
      cron.py                              # cron stub
      health_server.py                     # HTTP server porta 9000
    tests/
    pyproject.toml
    Dockerfile
    .env.example
    .dockerignore

  supabase/
    migrations/                            # vazio, Fase 0 popula
    config.toml                            # mínimo
    .gitignore                             # ignora .temp/

  docs/
    architecture.md                        # stub referenciando OVERVIEW.md

  docker-compose.dev.yml                   # frontend + backend + workers + redis
  railway.json                             # declaração dos serviços
  .env.example                             # exemplo consolidado
  .gitignore                               # atualizado
  CLAUDE.md                                # reescrito
  README.md                                # reescrito
```

### 3.2 Dockerfiles funcionais mínimos

**frontend/Dockerfile:**
```dockerfile
# Stage 1: build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# Stage 2: serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget --spider -q http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
```

**backend/Dockerfile:**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
RUN pip install --no-cache-dir uv && uv pip install --system -e .
COPY . .
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:8000/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**workers/Dockerfile:**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
RUN pip install --no-cache-dir uv && uv pip install --system -e .
COPY . .
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:9000/health || exit 1
CMD ["arq", "app.main.WorkerSettings"]
```

### 3.3 `docker-compose.dev.yml`

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  backend:
    build:
      context: ./backend
    env_file: ./backend/.env.local
    environment:
      - REDIS_URL=redis://redis:6379/0
    ports: ["8000:8000"]
    depends_on:
      redis:
        condition: service_healthy
    develop:
      watch:
        - action: sync
          path: ./backend/app
          target: /app/app

  workers:
    build:
      context: ./workers
    env_file: ./workers/.env.local
    environment:
      - REDIS_URL=redis://redis:6379/0
    ports: ["9000:9000"]
    depends_on:
      redis:
        condition: service_healthy
    develop:
      watch:
        - action: sync
          path: ./workers/app
          target: /app/app

  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_BASE_URL: http://localhost:8000
    ports: ["3000:80"]
    depends_on:
      - backend
```

### 3.4 Backend scaffolding mínimo

`backend/app/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .api.v1 import health

app = FastAPI(title="Cartorio Dashboard Backend", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])

@app.get("/health")
async def root_health():
    return {"status": "ok", "service": "backend", "version": app.version}
```

### 3.5 Workers scaffolding mínimo

`workers/app/main.py`:
```python
from arq.connections import RedisSettings
from .settings import settings

async def example_task(ctx):
    return {"status": "ok"}

class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [example_task]
    # cron_jobs = []  # Fase 4 popula
    on_startup = None
    on_shutdown = None
    max_jobs = 10
```

### 3.6 Frontend scaffolding mínimo

`frontend/src/App.tsx`:
```tsx
import { RouterProvider } from 'react-router-dom'
import { router } from './routes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
```

`frontend/src/pages/HealthPage.tsx`:
```tsx
import { useEffect, useState } from 'react'

export default function HealthPage() {
  const [backend, setBackend] = useState<string>('checking...')
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE_URL}/health`)
      .then(r => r.json())
      .then(d => setBackend(JSON.stringify(d)))
      .catch(e => setBackend(`error: ${e.message}`))
  }, [])
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-4">Cartório Dashboard — Health</h1>
        <p className="text-muted-foreground mb-2">Frontend OK</p>
        <pre className="text-xs bg-muted p-4 rounded">{backend}</pre>
      </div>
    </main>
  )
}
```

### 3.7 `CLAUDE.md` reescrito

Substitui a descrição da 3-layer architecture por:

```markdown
# Agent Instructions

Este projeto é um Dashboard de monitoramento de reviews do Google Business Profile para o Cartório Paulista, rodando em containers Railway com Supabase como banco de dados.

## Stack

- **frontend/** — Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui. nginx:alpine em container.
- **backend/** — FastAPI + SQLAlchemy 2 async + Pydantic v2. uvicorn em container.
- **workers/** — arq (async Redis queue) + cron built-in. Container Python.
- **redis** — Railway addon.
- **supabase/** — apenas migrations SQL. Postgres + Auth. Plano Free.
- **.planning/enterprise-rebuild/** — spec-driven development docs. LEIA `OVERVIEW.md` ao iniciar qualquer sessão.

## Princípios operacionais

1. **Segurança primeiro.** service_role só no backend/workers. Frontend nunca fala com Supabase direto.
2. **RLS sempre habilitada** com default-deny. Defesa em profundidade.
3. **Migrations versionadas** em `supabase/migrations/`. Zero alteração de schema fora do git.
4. **Observabilidade obrigatória.** structlog JSON, Sentry, Railway Logs, correlation ID.
5. **Test-first** em caminhos críticos (auth, dados, regras de negócio).
6. **Vertical planning.** Cada fase entrega algo testável end-to-end.

## Antes de qualquer mudança

1. Leia `.planning/enterprise-rebuild/CONSTITUTION.md` — regras invioláveis.
2. Leia `.planning/enterprise-rebuild/OVERVIEW.md` — fase atual e próxima.
3. Leia a SPEC da fase ativa.
4. Confirme com o Senhor antes de operações destrutivas.
```

### 3.8 `.gitignore` atualizado

Adicionar:
```
# Python
**/.venv/
**/__pycache__/
**/*.pyc
**/.pytest_cache/
**/.mypy_cache/
**/.ruff_cache/

# Node / Vite
frontend/node_modules/
frontend/dist/
frontend/.vite/

# Env
**/.env
**/.env.*
!**/.env.example

# Railway
.railway/
```

---

## 4. Invariantes

1. **Nenhum código legado é deletado permanentemente.** Tudo que sai vai para `.planning/enterprise-rebuild/legacy-snapshot/` como tarball ou `.planning/enterprise-rebuild/legacy-docs-archive/` como arquivo.
2. **Nenhuma chave é exposta.** Rotação fica para Fase 0; esta fase só mexe em estrutura.
3. **Nenhuma migration de banco** é aplicada nesta fase. Tudo é apenas sistema de arquivos + scaffolding.
4. **Os quatro containers sobem local** ao fim da fase. Se algum não subir, a fase não está completa.
5. **O Supabase real não é tocado.** Consultas read-only via Management API (que já fizemos no snapshot) são OK.
6. **O dev server atual do Next.js pode permanecer rodando** (background task `bf6rsokge`) durante a fase, mas o diretório `dashboard-frontend/` vira tarball no fim — quando o task for encerrado, não há retorno.

---

## 5. Limites de Escopo

### In
- Deletar/arquivar código legado.
- Criar scaffolding de `frontend/`, `backend/`, `workers/`, `supabase/migrations/`, `docs/`.
- `docker-compose.dev.yml`, `railway.json`, `.env.example`.
- Reescrever `CLAUDE.md` e `README.md`.
- Atualizar `.gitignore`.
- Commits granulares documentando cada etapa.

### Out
- Implementar lógica de negócio (qualquer).
- Rotacionar credenciais.
- Aplicar migrations SQL.
- Implementar auth.
- Deployar na Railway (só prepara os arquivos; deploy real é quando o Senhor autorizar).
- Rodar scraper/coleta.

---

## 6. Stack / Padrões

### Backend
- Python 3.12
- FastAPI >= 0.115
- Uvicorn >= 0.32
- Pydantic v2 + pydantic-settings
- SQLAlchemy 2 async + asyncpg
- structlog
- httpx
- (dev) pytest, pytest-asyncio, mypy, ruff, uv (package manager)

### Workers
- Python 3.12
- arq (última versão estável)
- redis-py >= 5
- httpx
- structlog
- (dev) pytest, pytest-asyncio, fakeredis, mypy, ruff, uv

### Frontend
- Node 22 (build)
- Vite 6
- React 19
- TypeScript 5
- TailwindCSS 4
- shadcn/ui CLI (para scaffolding)
- React Router 7
- TanStack Query 5
- Axios ou fetch nativo
- (dev) Vitest, ESLint, Prettier, tsc

### Infra
- Docker 24+
- docker compose v2
- Railway CLI (opcional; deploy via Git integration)

### Convenções
- **Commits atômicos** por mudança estrutural (separar arquivamento de scaffolding de reescrita de docs).
- **Imports Python:** `ruff` isort style.
- **Imports TS:** path alias `@/*` apontando para `frontend/src/*`.
- **Nomes de arquivos:** `snake_case.py` (backend/workers), `kebab-case.tsx` ou `PascalCase.tsx` (frontend React — shadcn usa kebab).
- **TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`.
- **Python:** mypy strict onde possível; `from __future__ import annotations` em todos os módulos.

---

## 7. Verificação / Critérios de Aceitação

### AC-−1.1 — Código legado arquivado, não perdido
- **Given** fim da fase
- **When** rodo `ls .planning/enterprise-rebuild/legacy-snapshot/`
- **Then** vejo pelo menos `dashboard-frontend.tar.gz`, `scraper.tar.gz`, `supabase-functions.tar.gz`.

### AC-−1.2 — Docs decorativos arquivados
- **Given** fim da fase
- **When** rodo `ls .planning/enterprise-rebuild/legacy-docs-archive/`
- **Then** vejo `RELATORIO_ANALISE_CRITICA_DASHBOARD.md`, `IMPLEMENTACAO_COMPLETA.md`, `DOCUMENTACAO_FUNCIONALIDADES_FLUXOS.md`.

### AC-−1.3 — Raiz do repositório limpa
- **Given** fim da fase
- **When** rodo `ls` na raiz
- **Then** vejo apenas: `.github/`, `.githooks/`, `.planning/`, `backend/`, `docker-compose.dev.yml`, `docs/`, `frontend/`, `railway.json`, `supabase/`, `workers/`, `CLAUDE.md`, `README.md`, `.env.example`, `.gitignore`. Não vejo `dashboard-frontend/`, `scraper/`, `node_modules/`, `nul`, `dataset_*.json`, `EXECUTE_ESTE_SQL.sql`, `docker-compose.yml` (antigo), `package.json`, `package-lock.json` (raiz).

### AC-−1.4 — Dockerfiles funcionais
- **Given** fim da fase
- **When** rodo `docker build -t cartorio-backend:dev ./backend` (e equivalentes para frontend e workers)
- **Then** cada build termina com `successfully built`.

### AC-−1.5 — `docker compose up` sobe os quatro serviços
- **Given** fim da fase
- **When** rodo `docker compose -f docker-compose.dev.yml up --build -d`
- **Then** `docker compose ps` mostra `redis`, `backend`, `workers`, `frontend` todos `Up (healthy)`.

### AC-−1.6 — Backend responde health
- **Given** compose up
- **When** rodo `curl http://localhost:8000/health` e `curl http://localhost:8000/api/v1/health`
- **Then** recebo `{"status":"ok",...}` em ambos.

### AC-−1.7 — Frontend responde health
- **Given** compose up
- **When** abro `http://localhost:3000` no navegador
- **Then** vejo a página "Cartório Dashboard — Health" com o JSON `{"status":"ok",...}` do backend.

### AC-−1.8 — Workers rodam
- **Given** compose up
- **When** rodo `curl http://localhost:9000/health`
- **Then** recebo `{"status":"ok","service":"workers",...}`.

### AC-−1.9 — `CLAUDE.md` reescrito
- **Given** fim da fase
- **When** leio `CLAUDE.md`
- **Then** o conteúdo descreve a nova stack (Vite+FastAPI+arq+Railway) e referencia `.planning/enterprise-rebuild/`.

### AC-−1.10 — `README.md` reescrito
- **Given** fim da fase
- **When** leio `README.md`
- **Then** contém: visão geral, stack, como rodar local (`docker compose -f docker-compose.dev.yml up`), links para `.planning/enterprise-rebuild/`, estado da reestruturação.

### AC-−1.11 — `railway.json` válido
- **Given** fim da fase
- **When** rodo `cat railway.json | python -m json.tool`
- **Then** o JSON é válido e declara os serviços esperados.

### AC-−1.12 — `.gitignore` atualizado
- **Given** fim da fase
- **When** crio um `.env` de teste em `backend/` e rodo `git status`
- **Then** o arquivo não aparece como untracked.

### AC-−1.13 — Testes mínimos passam
- **Given** fim da fase
- **When** rodo `cd backend && pytest -q` e `cd frontend && npm test`
- **Then** ambos retornam success (mesmo que seja só 1 teste cada, do health).

---

## 8. Restrições Operacionais

1. **O Senhor revisa cada commit importante** antes de prosseguir para a próxima task. A fase não é "rush"; é estrutural.
2. **Backup do repositório** antes de qualquer deleção destrutiva (`git clone --mirror` opcional).
3. **Nenhum `rm -rf` sem ter arquivado primeiro** em `legacy-snapshot/`.
4. **Nenhum `git rebase -i`** durante a fase.
5. **Commits em branch dedicada** `chore/phase-minus-1-cleanup`, merge para `new-dashboard-clean` (branch atual) no fim.

---

## 9. Riscos identificados

| Risco | Prob. | Impacto | Mitigação |
|---|:---:|:---:|---|
| Código legado útil jogado fora por engano | M | M | Triagem explícita de `scripts/`, `execution/`, `archive/` antes de arquivar. Tarball preservado em `legacy-snapshot/`. |
| Dev server Next.js atual (background task) fica com working dir inválido | A | B | Aviso ao encerrar o task; recuperação via tarball se necessário. |
| Scaffolding não roda local por incompatibilidade Python/Node | B | M | Pin de versões; teste em máquina limpa via Docker. |
| `.env.docker` ser esquecido durante cleanup | M | A | Task explícita (T−1.9) marca para a Fase 0 tratar; lembrete em `CHECKPOINT.md`. |
| Workdir sujo com arquivos untracked (`supabase/.temp/`, `execution/text_alias_matcher.py`) | A | B | Limpeza ou stash antes de começar. |

---

## 10. Tasks (alto nível)

Detalhe em `TASKS.md`. Resumo:

- **T−1.0** Criar branch + backup snapshot
- **T−1.1** Triagem e arquivamento de docs decorativos
- **T−1.2** Arquivar `dashboard-frontend/` (Next.js)
- **T−1.3** Arquivar `scraper/` + `supabase/functions/` + `scripts/` + `execution/`
- **T−1.4** Limpar raiz (`nul`, `dataset_*.json`, `node_modules/`, `docker-compose.yml` antigo, `package.json`/`package-lock.json` raiz, `tmp_apify_samples/`, `archive/`)
- **T−1.5** [P] Criar `frontend/` scaffolding Vite+React
- **T−1.6** [P] Criar `backend/` scaffolding FastAPI
- **T−1.7** [P] Criar `workers/` scaffolding arq
- **T−1.8** Criar `docker-compose.dev.yml` + `railway.json` + `.env.example` + `supabase/migrations/` vazio
- **T−1.9** Reescrever `CLAUDE.md` e `README.md`
- **T−1.10** Atualizar `.gitignore`
- **T−1.11** `docker compose up` + validar todos os ACs
- **T−1.12** Commit final + CHECKPOINT.md

---

## 11. Entregáveis

1. Branch `chore/phase-minus-1-cleanup` mergeada em `new-dashboard-clean`.
2. Repositório com estrutura alvo descrita em §3.1.
3. `legacy-snapshot/` populado com tarballs do código legado.
4. `legacy-docs-archive/` populado com MDs decorativos.
5. Quatro containers funcionando local.
6. `CLAUDE.md` e `README.md` reescritos.
7. `phase-minus-1-cleanup/CHECKPOINT.md` marcado "done".
8. `mem_save` com resumo da execução.
