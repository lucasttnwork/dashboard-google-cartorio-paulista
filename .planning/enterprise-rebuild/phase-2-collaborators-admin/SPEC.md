# SPEC — Phase 2: Collaborators Admin Panel

> **Status:** DRAFT — awaiting human approval (gate T2.W1.3)
> **Predecessor:** Phase 1 Auth & Backend BFF (`v0.0.3-phase-1`)
> **Branch:** `feat/phase-2-collaborators-admin`
> **Target tag:** `v0.0.4-phase-2`

---

## 1. Objetivo

Entregar um painel administrativo completo para gestão de colaboradores do
Cartório Paulista: CRUD, merge de duplicatas, gestão de aliases, audit log
de todas as mutações, e import/export CSV. O painel é acessível apenas a
usuários com role `admin` ou `manager`, usando a infraestrutura de auth da
Fase 1.

---

## 2. Contexto (fatos da research T2.W1.0)

### 2.1 Schema existente em prod

**`collaborators`** (17 rows, 4 inativos):

| Coluna | Tipo | Default | Constraint |
|---|---|---|---|
| id | bigint | nextval(seq) | PK |
| full_name | text | — | UNIQUE, NOT NULL (enforced by app) |
| aliases | text[] | '{}' | — |
| department | text | 'E-notariado' | — |
| position | text | — | nullable |
| is_active | boolean | true | — |
| created_at | timestamptz | now() | — |
| updated_at | timestamptz | now() | — |

Indexes: `idx_collaborators_full_name` (btree), `idx_collaborators_name_trgm`
(GIN pg_trgm), `idx_collaborators_aliases_gin` (GIN).

**`review_collaborators`** (2594 rows):

| Coluna | Tipo | Default | Constraint |
|---|---|---|---|
| review_id | text | — | FK → reviews(review_id) ON DELETE CASCADE |
| collaborator_id | bigint | — | FK → collaborators(id) ON DELETE CASCADE |
| mention_snippet | text | — | nullable |
| match_score | real | — | CHECK 0..1 |
| context_found | text | — | nullable |

PK: (review_id, collaborator_id). Index: `idx_review_collaborators_collaborator_id`.

**`review_collaborator_jobs`** — fila async de reprocessamento de menções.
Usa enums `review_collaborator_job_type` e `review_collaborator_job_status`.

### 2.2 Funções Postgres existentes (relevantes)

- `collaborator_alias_entries(p_collaborator_id)` — retorna full_name + aliases
- `collaborator_alias_trigger()` — enfileira refresh quando nome/aliases mudam
- `reprocess_reviews_for_collaborator(p_collaborator_id)` — re-scan de menções
- `process_collaborator_mentions()` — trigger em reviews INSERT/UPDATE
- `find_collaborator_mentions(comment)` — extrai menções de um comentário
- `match_review_collaborators(review_id, collaborator_id)` — lógica de match

Todas são SECURITY DEFINER com execute revogado de anon/authenticated (Fase 0).
O backend acessa via service_role.

### 2.3 Decisões vigentes

- **D18:** colaboradores inativos permanecem no histórico (503 menções a
  inativos). Toggle UI "incluir inativos" default OFF para listagem
  operacional, default ON para visualização histórica.
- **D1/D2:** toda operação de dados passa pelo backend FastAPI via cookie
  httpOnly. Frontend nunca fala com Supabase.
- **Q5:** 3 roles — admin (CRUD total + user mgmt), manager (CRUD dados),
  viewer (read-only). Collaborators CRUD: admin + manager. User mgmt: admin only.

### 2.4 Dados reais

- 17 colaboradores (13 ativos, 4 inativos)
- 2594 menções em review_collaborators
- 5372 reviews
- Inativos: João Lourenço, Kaio Gomes, Bianca Alves, Lucas Zupello
- department default: 'E-notariado'

---

## 3. Escopo

### 3.1 In-scope

1. **Migration `audit_log`**: tabela append-only para registrar toda mutação
   em collaborators (create, update, deactivate, reactivate, merge).
2. **Backend CRUD endpoints** em `/api/v1/collaborators`:
   - `GET /` — list com paginação, filtros (search, is_active), sorting
   - `GET /:id` — detalhe com contagem de menções
   - `POST /` — criar colaborador
   - `PATCH /:id` — editar (full_name, aliases, department, position, is_active)
   - `DELETE /:id` — soft-delete (set is_active=false)
   - `POST /:id/reactivate` — reativar (set is_active=true)
3. **Backend merge endpoint** `POST /api/v1/collaborators/merge`:
   - Recebe `{ source_id, target_id }` (source é absorvido pelo target)
   - Transfere todos os `review_collaborators` de source → target
   - Merge aliases: target.aliases += [source.full_name] + source.aliases
   - Soft-delete source (is_active=false)
   - Registra em audit_log com diff JSON
   - Enfileira reprocessamento de menções via arq worker
4. **Backend CSV endpoints**:
   - `GET /api/v1/collaborators/export` — CSV download
   - `POST /api/v1/collaborators/import` — CSV upload com validação
5. **Frontend página `/admin/collaborators`**:
   - TanStack Table com sorting, filtering, paginação
   - Toggle "Incluir inativos" (default off)
   - Search input (full-text no nome/aliases)
   - Badge de contagem de menções por colaborador
6. **Frontend dialogs**:
   - Criar colaborador (form: full_name, aliases, department, position)
   - Editar colaborador (mesmo form, pre-populated)
   - Merge dialog: selecionar source/target, preview de menções afetadas
7. **ORM models**: Collaborator, ReviewCollaborator, AuditLog
8. **arq worker task**: `reprocess_collaborator_mentions` — dispara
   reprocessamento quando aliases mudam ou após merge
9. **Testes**: >=20 backend pytest, >=8 frontend vitest, >=3 Playwright E2E

### 3.2 Out-of-scope

- Dashboard de visualização de menções (Fase 3)
- Scraper/coleta automática (Fase 4)
- Bulk operations além de CSV import
- MFA/user management UI (Fase 5)
- Alteração das funções Postgres existentes de matching — o backend
  invoca-as via service_role; se necessário ajustar, via nova migration

---

## 4. Invariantes

1. Toda mutação em `collaborators` gera um registro em `audit_log`.
2. `full_name` é UNIQUE — a migration existente já garante.
3. Merge nunca deleta fisicamente um colaborador — soft-delete via is_active.
4. Após merge, zero rows em `review_collaborators` apontam para o source.
5. CSV export contém exatamente os mesmos campos visíveis na tabela UI.
6. Viewer (role) não pode acessar nenhum endpoint de escrita em collaborators.
7. Viewer não vê o menu /admin/collaborators na UI (mas o guard de rota também bloqueia).
8. `audit_log` é append-only — sem UPDATE, sem DELETE no código da aplicação.
9. RLS deny_all permanece; backend bypassa via service_role.
10. Frontend nunca fala com Supabase diretamente.

---

## 5. Acceptance Criteria (Given/When/Then)

### AC-2.1 — List collaborators (default active only)

**Given** o admin está autenticado e há 17 colaboradores (13 ativos)
**When** GET `/api/v1/collaborators`
**Then** responde 200 com lista de 13 colaboradores ativos, paginada,
com contagem de menções por colaborador.

### AC-2.2 — List collaborators (include inactive)

**Given** o admin está autenticado
**When** GET `/api/v1/collaborators?include_inactive=true`
**Then** responde 200 com todos os 17 colaboradores.

### AC-2.3 — Search collaborators by name/alias

**Given** existe colaborador "Ana Sophia" com alias "Ana"
**When** GET `/api/v1/collaborators?search=ana`
**Then** "Ana Sophia" aparece nos resultados (case-insensitive, accent-insensitive).

### AC-2.4 — Create collaborator

**Given** admin autenticado, full_name "Novo Colaborador" não existe
**When** POST `/api/v1/collaborators` com `{ full_name: "Novo Colaborador", department: "E-notariado" }`
**Then** responde 201 com o colaborador criado, audit_log contém entrada
type=`create` com diff JSON.

### AC-2.5 — Create collaborator duplicate name

**Given** "Ana Sophia" já existe
**When** POST `/api/v1/collaborators` com `{ full_name: "Ana Sophia" }`
**Then** responde 409 Conflict.

### AC-2.6 — Update collaborator

**Given** colaborador id=1 existe
**When** PATCH `/api/v1/collaborators/1` com `{ position: "Tabeliã" }`
**Then** responde 200, position atualizado, audit_log contém entrada
type=`update` com before/after diff.

### AC-2.7 — Update aliases triggers reprocess

**Given** colaborador id=1 com aliases=["Ana"]
**When** PATCH `/api/v1/collaborators/1` com `{ aliases: ["Ana", "Aninha"] }`
**Then** responde 200, aliases atualizados, task `reprocess_collaborator_mentions`
enfileirada no arq.

### AC-2.8 — Soft-delete (deactivate)

**Given** colaborador id=5 ativo
**When** DELETE `/api/v1/collaborators/5`
**Then** responde 200, is_active=false, updated_at atualizado, audit_log
contém type=`deactivate`. Menções históricas preservadas.

### AC-2.9 — Reactivate

**Given** colaborador id=5 inativo
**When** POST `/api/v1/collaborators/5/reactivate`
**Then** responde 200, is_active=true, audit_log contém type=`reactivate`.

### AC-2.10 — Merge collaborators

**Given** source_id=3 tem 50 menções, target_id=7 tem 100 menções
**When** POST `/api/v1/collaborators/merge` com `{ source_id: 3, target_id: 7 }`
**Then** responde 200. Todas as menções de source transferidas para target
(ON CONFLICT preserva a de maior match_score). source.is_active=false.
target.aliases contém [source.full_name] + source.aliases (deduplicated).
audit_log contém type=`merge` com source/target/mentions_transferred.
Task `reprocess_collaborator_mentions` enfileirada para target.

### AC-2.11 — Merge self-referencing blocked

**Given** admin autenticado
**When** POST `/api/v1/collaborators/merge` com `{ source_id: 3, target_id: 3 }`
**Then** responde 400 bad_request.

### AC-2.12 — CSV export

**Given** admin autenticado, 17 colaboradores existem
**When** GET `/api/v1/collaborators/export?include_inactive=true`
**Then** responde 200 com Content-Type text/csv, header row + 17 data rows,
colunas: id, full_name, aliases, department, position, is_active,
mention_count, created_at.

### AC-2.13 — CSV import

**Given** admin autenticado, CSV válido com 2 novos colaboradores
**When** POST `/api/v1/collaborators/import` com multipart/form-data
**Then** responde 200 com `{ created: 2, updated: 0, errors: [] }`.
audit_log contém 2 entradas type=`create`.

### AC-2.14 — CSV import validation error

**Given** CSV com row sem full_name
**When** POST `/api/v1/collaborators/import`
**Then** responde 200 com `{ created: 0, updated: 0, errors: [{ row: 2, error: "full_name required" }] }`.

### AC-2.15 — Role gate: viewer blocked

**Given** viewer autenticado
**When** POST `/api/v1/collaborators` com body válido
**Then** responde 403 forbidden.

### AC-2.16 — Role gate: viewer cannot see admin page

**Given** viewer autenticado no frontend
**When** navega para `/admin/collaborators`
**Then** é redirecionado para `/` (ou página de acesso negado).

### AC-2.17 — Audit log immutability

**Given** audit_log tem N registros
**When** qualquer operação CRUD é executada
**Then** audit_log tem N+1 registros. Nenhum registro anterior foi alterado.

### AC-2.18 — Frontend table renders with TanStack Table

**Given** admin autenticado, abre `/admin/collaborators`
**When** a página carrega
**Then** TanStack Table renderiza com colunas (Nome, Departamento, Cargo,
Menções, Status, Ações), sorting funcional, paginação client-side.

### AC-2.19 — Frontend merge dialog preview

**Given** admin seleciona dois colaboradores para merge
**When** abre o merge dialog
**Then** dialog mostra source/target, contagem de menções que serão
transferidas, aliases que serão adicionados, botão "Confirmar Merge".

### AC-2.20 — E2E create-edit-deactivate flow

**Given** admin logado no browser
**When** cria colaborador "E2E Test", edita position, depois desativa
**Then** Playwright verifica: colaborador aparece na lista, position
atualizado, após desativação não aparece com filtro padrão.

---

## 6. Limites e Riscos

| Risco | Mitigação |
|---|---|
| Merge com ON CONFLICT em review_collaborators pode perder snippets | Preservar row com maior match_score; log do merge registra counts |
| pg_trgm search lento em grandes datasets | 17 colaboradores — irrelevante; index GIN já existe |
| CSV import com dados malformados | Validação row-by-row, erros retornados sem abort |
| Concorrência: dois admins mergeando o mesmo colaborador | SELECT FOR UPDATE no source dentro de transação |
| arq worker indisponível | Merge completa sem reprocess; reprocess é eventual consistency |

---

## 7. Dependências

- **Fase 1:** auth endpoints, cookie session, require_role, get_current_user
- **Fase 0:** RLS deny_all, revoked anon grants, baseline migration
- **Prod data:** 17 colaboradores, 2594 menções (read-only nesta fase)
- **arq worker:** container workers já funcional (Fase −1 scaffolding)

---

## 8. Não-goals (explícito)

- Não alterar funções Postgres de matching existentes
- Não implementar dashboard de visualização (Fase 3)
- Não implementar reprocessamento automático em bulk de todos os reviews
- Não implementar notificações (Fase 5)
- Não implementar user management UI (Fase 5)
