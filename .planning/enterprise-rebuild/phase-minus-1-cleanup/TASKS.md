# TASKS — Phase −1: Cleanup & Architectural Pivot

> Tasks sequenciais por padrão. Marcadas `[P]` podem rodar em paralelo com a anterior. Ícones: 🧍 ação humana obrigatória, 🤖 executável pelo agente, 🔀 paralelizável, ⚠ destrutivo sem rollback automático.

---

## T−1.0 — Branch + backup 🤖

**Passos:**
1. Commitar mudanças atuais não-commitadas (`.planning/enterprise-rebuild/` que acabou de ser criada).
   ```
   git add .planning/
   git commit -m "docs(planning): enterprise rebuild scaffolding (spec v2, phase -1 + phase 0)"
   ```
2. Criar branch: `git checkout -b chore/phase-minus-1-cleanup`.
3. Backup mirror do repo atual: `git clone --mirror . ../dashboard-backup-before-cleanup-2026-04-09.git`. Em caso de rollback, `git clone` deste mirror restaura tudo.
4. Verificar working tree limpo com `git status`.

**Verificação:** branch criada, backup existe no caminho informado, git status limpo ou apenas com untracked conhecidos.

**Risco:** B (operações git padrão).

**Tempo:** S

---

## T−1.1 — Triagem e arquivamento de docs decorativos 🤖

**Passos:**
1. Criar diretório `.planning/enterprise-rebuild/legacy-docs-archive/`.
2. Mover os seguintes arquivos para lá:
   - `dashboard-frontend/RELATORIO_ANALISE_CRITICA_DASHBOARD.md`
   - `IMPLEMENTACAO_COMPLETA.md`
   - `dashboard-frontend/DOCUMENTACAO_FUNCIONALIDADES_FLUXOS.md`
3. Se houver `dashboard-frontend/README.md` específico do Next.js, arquivar também.
4. `git add` + commit: `chore: archive decorative legacy docs to .planning/enterprise-rebuild/legacy-docs-archive`.

**Verificação:** `ls .planning/enterprise-rebuild/legacy-docs-archive/` mostra os 3 arquivos; `ls` raiz e dashboard-frontend não os mostra mais.

**Risco:** B.

**Tempo:** S

---

## T−1.2 — Arquivar `dashboard-frontend/` ⚠ 🤖

**Depende de:** T−1.0.

**Passos:**
1. Encerrar o dev server Next.js em background (`KillShell bf6rsokge`).
2. Criar `.planning/enterprise-rebuild/legacy-snapshot/` se não existir.
3. `tar -czf .planning/enterprise-rebuild/legacy-snapshot/dashboard-frontend.tar.gz --exclude='dashboard-frontend/node_modules' --exclude='dashboard-frontend/.next' dashboard-frontend/`
4. Verificar que o tarball tem tamanho razoável (esperado 1-3 MB sem `node_modules`/`.next`).
5. `git rm -r dashboard-frontend/` (se rastreado) ou `rm -rf dashboard-frontend/`.
6. Commit: `chore: archive dashboard-frontend (Next.js) to legacy-snapshot`.

**Verificação:** `ls dashboard-frontend/` retorna erro; `tar -tzf .planning/.../dashboard-frontend.tar.gz | head` lista os arquivos.

**Risco:** M — se o tarball estiver corrompido, perdemos o código. Mitigação: T−1.0 tem mirror do repo inteiro.

**Tempo:** S

---

## T−1.3 — Arquivar outros legados 🤖

**Passos:**
1. `tar -czf .planning/enterprise-rebuild/legacy-snapshot/scraper.tar.gz --exclude='scraper/node_modules' scraper/` → `rm -rf scraper/`
2. `tar -czf .planning/enterprise-rebuild/legacy-snapshot/supabase-functions.tar.gz supabase/functions/` → `rm -rf supabase/functions/`
3. `tar -czf .planning/enterprise-rebuild/legacy-snapshot/scripts-node.tar.gz scripts/` → decisão sobre deletar `scripts/`:
   - **Triagem:** se algum script Node tem lógica reaproveitável, fica em `.planning/enterprise-rebuild/legacy-snapshot/` e depois migra como Python na Fase 4. O diretório `scripts/` é deletado.
4. `tar -czf .planning/enterprise-rebuild/legacy-snapshot/execution-python.tar.gz execution/` → decidir:
   - `execution/text_alias_matcher.py` (untracked) é reaproveitável no worker Python → manter lógica em mente, arquivar o original.
   - `execution/review_alias_imputer.py`, `execution/upsert_collaborator_aliases.py`, `execution/convert-csv-to-json.js` idem.
   - O diretório `execution/` é deletado depois de arquivado.
5. `tar -czf .planning/enterprise-rebuild/legacy-snapshot/directives.tar.gz directives/` → `rm -rf directives/` (será recriado em `docs/runbooks/` na Fase 5 se necessário).
6. `tar -czf .planning/enterprise-rebuild/legacy-snapshot/supabase-sql.tar.gz supabase/sql/ EXECUTE_ESTE_SQL.sql 2>/dev/null` → preserva o SQL legado para portagem na Fase 0. `supabase/sql/` e `EXECUTE_ESTE_SQL.sql` **NÃO são deletados ainda** — a Fase 0 usa como fonte.
7. Verificar `archive/` — é legado ou atual? `ls archive/` e decidir. Se for legado, arquivar e deletar.
8. Commit: `chore: archive legacy code (scraper, functions, scripts, execution, directives) to legacy-snapshot`.

**Verificação:** `ls .planning/enterprise-rebuild/legacy-snapshot/*.tar.gz` lista os tarballs; `ls scraper/ scripts/ execution/ directives/ supabase/functions/` retorna erro.

**Risco:** M.

**Tempo:** M

---

## T−1.4 — Limpar raiz 🤖

**Passos:**
1. Deletar `nul` (`rm -f nul`).
2. Mover datasets para `.tmp/` (gitignored):
   ```
   mkdir -p .tmp/legacy-datasets
   mv dataset_Google-Maps-Reviews-Scraper_*.json .tmp/legacy-datasets/
   ```
3. Deletar `node_modules/` da raiz (`rm -rf node_modules/`).
4. Deletar `package.json` e `package-lock.json` da raiz (eram para os scripts Node da raiz, que foram arquivados).
5. Deletar `docker-compose.yml` antigo (será substituído por `docker-compose.dev.yml`).
6. Deletar `tmp_apify_samples/` (redundante com `.tmp/`).
7. `.auto-claude/worktrees/` — inspecionar. Se contiver apenas artefatos de sessões antigas, deletar. Se tiver algum `.env` com chaves, arquivar antes de deletar.
8. Commit: `chore: clean repo root (nul, datasets, node_modules, package.json, docker-compose.yml)`.

**Verificação:** `ls` na raiz não mostra esses arquivos; `git status` limpo.

**Risco:** M — se o Senhor ainda usava `scripts/upsert-google-reviews.js` em alguma emergência, vai parar. Mitigação: tarball em `legacy-snapshot/`.

**Tempo:** S

---

## T−1.5 — Criar `frontend/` scaffolding [P] 🤖

**Pré-condições:** Node 22+ instalado.

**Passos:**
1. `mkdir frontend && cd frontend`
2. Inicializar Vite:
   ```
   npm create vite@latest . -- --template react-ts
   npm install
   ```
3. Instalar dependências base:
   ```
   npm install react-router-dom@7 @tanstack/react-query axios
   npm install -D tailwindcss@4 @tailwindcss/vite postcss autoprefixer
   npm install class-variance-authority clsx tailwind-merge lucide-react
   npm install -D @types/node
   ```
4. Configurar Tailwind v4 conforme docs oficiais (`vite.config.ts` com plugin).
5. Criar `src/main.tsx`, `src/App.tsx`, `src/routes.tsx`, `src/pages/HealthPage.tsx` conforme SPEC §3.6.
6. Criar `src/index.css` com Tailwind diretivas.
7. Criar `src/lib/api/client.ts` stub (apenas exporta axios instance com `baseURL = import.meta.env.VITE_API_BASE_URL`, `withCredentials: true`).
8. Criar `.env.example`:
   ```
   VITE_API_BASE_URL=http://localhost:8000
   ```
9. Criar `nginx.conf` para server a `dist/`:
   ```
   server {
     listen 80;
     server_name _;
     root /usr/share/nginx/html;
     index index.html;
     location / { try_files $uri $uri/ /index.html; }
   }
   ```
10. Criar `Dockerfile` conforme SPEC §3.2.
11. Criar `.dockerignore` (`node_modules`, `dist`, `.env*`).
12. `npm run build` para validar.
13. Commit: `feat(frontend): scaffold Vite + React + Tailwind v4`.

**Verificação:** `cd frontend && npm run build` gera `dist/`; `docker build -t cartorio-frontend:dev .` sucesso.

**Risco:** M — Tailwind v4 ainda tem algumas pegadinhas; validar docs oficiais.

**Tempo:** M

---

## T−1.6 — Criar `backend/` scaffolding [P] 🤖

**Pré-condições:** Python 3.12+ instalado.

**Passos:**
1. `mkdir backend && cd backend`
2. Criar `pyproject.toml`:
   ```toml
   [project]
   name = "cartorio-backend"
   version = "0.0.1"
   requires-python = ">=3.12"
   dependencies = [
     "fastapi>=0.115",
     "uvicorn[standard]>=0.32",
     "pydantic>=2.9",
     "pydantic-settings>=2.5",
     "sqlalchemy[asyncio]>=2.0",
     "asyncpg>=0.29",
     "httpx>=0.27",
     "structlog>=24.4",
     "python-jose[cryptography]>=3.3",
     "python-multipart>=0.0.12",
     "sentry-sdk[fastapi]>=2.17",
     "redis>=5.1",
   ]

   [project.optional-dependencies]
   dev = [
     "pytest>=8.3",
     "pytest-asyncio>=0.24",
     "httpx>=0.27",
     "ruff>=0.6",
     "mypy>=1.11",
     "uv>=0.4",
   ]

   [tool.ruff]
   line-length = 100
   target-version = "py312"

   [tool.mypy]
   strict = true
   python_version = "3.12"

   [tool.pytest.ini_options]
   asyncio_mode = "auto"
   ```
3. Criar estrutura `app/`:
   - `app/__init__.py`
   - `app/main.py` (SPEC §3.4)
   - `app/core/__init__.py`
   - `app/core/config.py` — Pydantic BaseSettings com `database_url`, `supabase_url`, `supabase_service_role_key`, `redis_url`, `cors_origins`, `sentry_dsn`.
   - `app/core/logging.py` — configura structlog JSON.
   - `app/api/__init__.py`
   - `app/api/v1/__init__.py`
   - `app/api/v1/health.py` — router com `GET /health` retornando `{"status":"ok","service":"backend"}`.
   - `app/db/__init__.py`
   - `app/db/session.py` — SQLAlchemy async engine factory (stub — não conecta a nada ainda).
   - `app/deps/__init__.py`
4. Criar `tests/__init__.py` e `tests/test_health.py` com teste usando `httpx.AsyncClient`.
5. Criar `.env.example`:
   ```
   ENV=local
   DATABASE_URL=postgresql+asyncpg://...
   SUPABASE_URL=https://bugpetfkyoraidyxmzxu.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<set_in_railway>
   REDIS_URL=redis://localhost:6379/0
   CORS_ORIGINS=http://localhost:3000
   SENTRY_DSN=
   LOG_LEVEL=INFO
   ```
6. Criar `Dockerfile` conforme SPEC §3.2.
7. Criar `.dockerignore`.
8. `uv pip install --system -e .[dev]` ou `pip install -e .[dev]`.
9. Rodar: `uvicorn app.main:app --reload` e testar `curl http://localhost:8000/health`.
10. Rodar: `pytest -q`.
11. Commit: `feat(backend): scaffold FastAPI + Pydantic v2 + health endpoint`.

**Verificação:** uvicorn sobe, `/health` retorna JSON; `pytest -q` passa.

**Risco:** B.

**Tempo:** M

---

## T−1.7 — Criar `workers/` scaffolding [P] 🤖

**Passos:**
1. `mkdir workers && cd workers`
2. `pyproject.toml`:
   ```toml
   [project]
   name = "cartorio-workers"
   version = "0.0.1"
   requires-python = ">=3.12"
   dependencies = [
     "arq>=0.26",
     "redis>=5.1",
     "httpx>=0.27",
     "pydantic>=2.9",
     "pydantic-settings>=2.5",
     "structlog>=24.4",
     "sentry-sdk>=2.17",
     "asyncpg>=0.29",
     "sqlalchemy[asyncio]>=2.0",
   ]

   [project.optional-dependencies]
   dev = [
     "pytest>=8.3",
     "pytest-asyncio>=0.24",
     "fakeredis>=2.26",
     "ruff>=0.6",
     "mypy>=1.11",
   ]
   ```
3. Estrutura `app/`:
   - `app/__init__.py`
   - `app/settings.py` — Pydantic BaseSettings.
   - `app/main.py` — WorkerSettings conforme SPEC §3.5.
   - `app/tasks/__init__.py`
   - `app/tasks/example.py` — task stub.
   - `app/cron.py` — empty list por enquanto.
   - `app/health_server.py` — `aiohttp` ou `fastapi` separado na porta 9000 com `/health`.
4. `tests/test_example.py` com `fakeredis`.
5. `.env.example`:
   ```
   REDIS_URL=redis://localhost:6379/0
   DATABASE_URL=postgresql+asyncpg://...
   SUPABASE_URL=https://bugpetfkyoraidyxmzxu.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<set_in_railway>
   SENTRY_DSN=
   LOG_LEVEL=INFO
   ```
6. `Dockerfile` conforme SPEC §3.2 mas CMD é `python -m app.main` (um entry que sobe o health server + arq worker em background).
7. Testar local: Redis via `docker run -d -p 6379:6379 redis:7-alpine`, depois `arq app.main.WorkerSettings` em um terminal e `curl http://localhost:9000/health` em outro.
8. Commit: `feat(workers): scaffold arq + health endpoint`.

**Verificação:** arq worker sobe; health endpoint responde.

**Risco:** M — orquestrar health server + arq no mesmo container requer cuidado. Pode ser `asyncio.gather(arq_main(), health_server())` ou dois processos via `supervisord`.

**Tempo:** M

---

## T−1.8 — Glue files 🤖

**Depende de:** T−1.5, T−1.6, T−1.7.

**Passos:**
1. Criar `docker-compose.dev.yml` conforme SPEC §3.3.
2. Criar `railway.json` declarando os 4 serviços:
   ```json
   {
     "$schema": "https://railway.app/railway.schema.json",
     "build": { "builder": "DOCKERFILE" },
     "deploy": { "restartPolicyType": "ON_FAILURE", "restartPolicyMaxRetries": 3 }
   }
   ```
   (Railway permite configuração via UI também; `railway.json` é complementar. Detalhar cada serviço no dashboard.)
3. Criar `.env.example` raiz consolidado:
   ```
   # See backend/.env.example, frontend/.env.example, workers/.env.example
   # for the canonical env var list per service.
   SUPABASE_ACCESS_TOKEN=<management_api_token>
   ```
4. Criar `supabase/migrations/` vazio + `supabase/config.toml` mínimo (só para Supabase CLI reconhecer).
5. Criar `docs/architecture.md` stub apontando para `.planning/enterprise-rebuild/OVERVIEW.md`.
6. Criar `.github/workflows/` vazio (Fase 0 popula).
7. Criar `.githooks/` vazio (Fase 0 popula).
8. Commit: `chore: wire docker-compose.dev + railway.json + supabase migrations dir`.

**Verificação:** arquivos existem, JSON é válido, docker-compose parse ok (`docker compose -f docker-compose.dev.yml config`).

**Risco:** B.

**Tempo:** S

---

## T−1.9 — Reescrever `CLAUDE.md` e `README.md` 🤖

**Passos:**
1. Reescrever `CLAUDE.md` conforme SPEC §3.7.
2. Reescrever `README.md`:
   - Título + 1 parágrafo de visão.
   - Stack summary.
   - "Como começar" com comandos `docker compose -f docker-compose.dev.yml up --build`.
   - Link para `.planning/enterprise-rebuild/OVERVIEW.md` e `CLAUDE.md`.
   - Seção "Estado atual da reestruturação" listando fase corrente.
3. Mover o `CLAUDE.md` atual para `.planning/enterprise-rebuild/legacy-docs-archive/CLAUDE-legacy.md` antes de sobrescrever.
4. Commit: `docs: rewrite CLAUDE.md and README.md for new Python/Railway stack`.

**Verificação:** ambos os arquivos existem com conteúdo novo; arquivo legacy preservado.

**Risco:** B.

**Tempo:** S

---

## T−1.10 — `.gitignore` atualizado 🤖

**Passos:**
1. Adicionar regras conforme SPEC §3.8.
2. Testar criando `.env` fake em `backend/`, `frontend/`, `workers/` e verificando que não aparecem em `git status`.
3. Remover os `.env` fake.
4. Commit: `chore: update .gitignore for new stack artifacts`.

**Verificação:** AC-−1.12.

**Risco:** B.

**Tempo:** S

---

## T−1.11 — Validação integrada 🤖 ⚠

**Depende de:** todas as anteriores.

**Passos:**
1. `docker compose -f docker-compose.dev.yml build`.
2. `docker compose -f docker-compose.dev.yml up -d`.
3. `docker compose -f docker-compose.dev.yml ps` — todos os 4 serviços `Up (healthy)`.
4. `curl http://localhost:8000/health` → 200 JSON.
5. `curl http://localhost:8000/api/v1/health` → 200 JSON.
6. `curl http://localhost:9000/health` → 200 JSON.
7. `curl http://localhost:3000/` → 200 HTML.
8. Abrir `http://localhost:3000/` no navegador → ver "Cartório Dashboard — Health" com JSON do backend.
9. `docker compose -f docker-compose.dev.yml down`.
10. Rodar os testes:
    - `cd backend && pytest -q`
    - `cd workers && pytest -q`
    - `cd frontend && npm test -- --run` (se houver)
11. Commit: `test: validate phase -1 scaffolding end-to-end`.

**Verificação:** ACs −1.4, −1.5, −1.6, −1.7, −1.8, −1.13 passam.

**Risco:** A — integração pode falhar por mil motivos (rede, porta, ordem de startup). Cada falha gera issue nova.

**Tempo:** M

---

## T−1.12 — Checkpoint + merge 🤖

**Passos:**
1. Criar `phase-minus-1-cleanup/CHECKPOINT.md` com:
   - Data início/fim
   - Tasks concluídas com links para commits
   - ACs verificados com evidências
   - Issues encontradas e resoluções
2. Rebase/cleanup da branch `chore/phase-minus-1-cleanup` se necessário.
3. Merge para `new-dashboard-clean` (branch base atual).
4. Push.
5. `mem_save` com resumo.

**Verificação:** CHECKPOINT marcado "done"; `git log` mostra histórico limpo; branch mergeada.

**Risco:** B.

**Tempo:** S

---

## Ordem visual

```
T−1.0 ──> T−1.1 ──> T−1.2 ──> T−1.3 ──> T−1.4 ──┐
                                                 │
                                                 ├──> T−1.5 [P]
                                                 ├──> T−1.6 [P]
                                                 ├──> T−1.7 [P]
                                                 │        │
                                                 │        ▼
                                                 └──> T−1.8 ──> T−1.9 ──> T−1.10 ──> T−1.11 ──> T−1.12
```

---

## Definição de "Done" da Phase −1

- [ ] Todos os 13 ACs da SPEC passam.
- [ ] `legacy-snapshot/` e `legacy-docs-archive/` populados.
- [ ] Repositório com estrutura alvo.
- [ ] `docker compose -f docker-compose.dev.yml up` sobe todos os serviços healthy.
- [ ] `CLAUDE.md` e `README.md` reescritos.
- [ ] CHECKPOINT.md marcado "done".
- [ ] Senhor aprovou encerramento.
- [ ] `mem_save` registrado.
- [ ] Branch mergeada em `new-dashboard-clean`.
- [ ] Fase 0 (Security Baseline) pode começar imediatamente a seguir.
