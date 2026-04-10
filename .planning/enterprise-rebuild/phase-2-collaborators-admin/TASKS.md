# TASKS — Phase 2: Collaborators Admin Panel

> **Status:** DRAFT — awaiting human approval (gate T2.W1.3)
> **SPEC:** `phase-2-collaborators-admin/SPEC.md`
> **Branch:** `feat/phase-2-collaborators-admin`

---

## Legend

| Icon | Meaning |
|---|---|
| 🤖 | Agent-executable (no human input required) |
| 🧍 | Human gate (requires explicit approval) |
| ⚠ | Risk or special attention needed |
| [P] | Parallelizable with other tasks in same wave |

---

## Wave 1 — Research & Planning

### T2.W1.0 — Research collaborators schema + data in prod 🤖
- **Input:** baseline migration, prod snapshot, DESIGN-DISCUSSION D18
- **Output:** facts documented in SPEC §2
- **Status:** DONE (incorporated in SPEC.md)

### T2.W1.1 — Write SPEC.md 🤖
- **Output:** `phase-2-collaborators-admin/SPEC.md` with 20 ACs
- **Status:** DONE

### T2.W1.2 — Write TASKS.md 🤖
- **Output:** this file
- **Status:** DONE

### T2.W1.3 — 🧍 Gate: approve SPEC + TASKS
- **Action:** Senhor reviews SPEC.md and TASKS.md
- **Criteria:** all ACs make sense, waves are correct, no missing scope
- **Blocks:** all W2+ tasks

---

## Wave 2 — Backend: Migration + ORM + Service

### T2.W2.0 — Scaffolding: stubs + dependencies 🤖
- **Deps:** T2.W1.3
- Create stub files:
  - `backend/app/db/models/collaborator.py`
  - `backend/app/db/models/audit_log.py`
  - `backend/app/services/collaborator_service.py`
  - `backend/app/api/v1/collaborators.py`
  - `backend/app/schemas/collaborator.py`
- Add `tanstack/react-table` to frontend deps (can be deferred to W3)
- Register collaborators router in `main.py`
- **Commit:** `chore(phase-2): scaffolding stubs and router wiring (T2.W2.0)`

### T2.W2.1 — Migration: audit_log table 🤖 [P]
- **Deps:** T2.W2.0
- File: `supabase/migrations/YYYYMMDDHHMMSS_audit_log.sql`
- Schema:
  ```sql
  create table public.audit_log (
      id bigint generated always as identity primary key,
      entity_type text not null,        -- 'collaborator'
      entity_id bigint not null,
      action text not null,             -- 'create','update','deactivate','reactivate','merge'
      actor_id uuid not null,           -- references auth.users(id) via user_profiles
      actor_email text not null,
      diff jsonb not null default '{}',
      created_at timestamptz not null default now()
  );
  -- RLS deny_all (consistent with Phase 0 pattern)
  alter table public.audit_log enable row level security;
  create policy audit_log_deny_all on public.audit_log
      as restrictive for all to public using (false);
  -- Indexes
  create index idx_audit_log_entity on public.audit_log (entity_type, entity_id);
  create index idx_audit_log_created on public.audit_log (created_at desc);
  ```
- ORM model: `backend/app/db/models/audit_log.py`
- **Commit:** `feat(phase-2): audit_log migration and ORM model (T2.W2.1)`

### T2.W2.2 — ORM models: Collaborator + ReviewCollaborator 🤖 [P]
- **Deps:** T2.W2.0
- `backend/app/db/models/collaborator.py`:
  - `Collaborator` mapped to `public.collaborators`
  - `ReviewCollaborator` mapped to `public.review_collaborators`
- Update `backend/app/db/models/__init__.py` with imports
- **Commit:** `feat(phase-2): Collaborator and ReviewCollaborator ORM models (T2.W2.2)`

### T2.W2.3 — Pydantic schemas 🤖 [P]
- **Deps:** T2.W2.0
- `backend/app/schemas/collaborator.py`:
  - `CollaboratorOut` — response model
  - `CollaboratorCreate` — POST body
  - `CollaboratorUpdate` — PATCH body (all optional)
  - `CollaboratorListResponse` — paginated list with total
  - `MergeRequest` — `{ source_id, target_id }`
  - `MergeResponse` — `{ mentions_transferred, aliases_added, ... }`
  - `CSVImportResponse` — `{ created, updated, errors }`
  - `AuditLogOut` — response model for audit entries
- **Commit:** `feat(phase-2): Pydantic schemas for collaborators (T2.W2.3)`

### T2.W2.4 — Service layer: CollaboratorService 🤖
- **Deps:** T2.W2.1, T2.W2.2, T2.W2.3
- `backend/app/services/collaborator_service.py`:
  - `list_collaborators(search, include_inactive, page, page_size, sort_by, sort_order)` → paginated list with mention counts via subquery
  - `get_collaborator(id)` → single with mention count
  - `create_collaborator(data, actor)` → create + audit
  - `update_collaborator(id, data, actor)` → update + audit + enqueue reprocess if aliases changed
  - `deactivate_collaborator(id, actor)` → soft-delete + audit
  - `reactivate_collaborator(id, actor)` → reactivate + audit
  - `merge_collaborators(source_id, target_id, actor)` → full merge logic with SELECT FOR UPDATE + audit
  - `export_csv(include_inactive)` → generate CSV content
  - `import_csv(file, actor)` → parse + validate + create/update + audit
- Each mutating method writes to audit_log in the same transaction
- **Commit:** `feat(phase-2): CollaboratorService with CRUD, merge, CSV (T2.W2.4)`

### T2.W2.5 — API endpoints 🤖
- **Deps:** T2.W2.4
- `backend/app/api/v1/collaborators.py`:
  - All endpoints use `Depends(require_role("admin", "manager"))` for writes
  - GET endpoints use `Depends(require_authenticated)` (all roles can read — or restrict to admin+manager per SPEC)
  - Wire CSV export as StreamingResponse with Content-Disposition
  - Wire CSV import as UploadFile
  - Wire merge endpoint
- Mount router in `main.py`: `app.include_router(collaborators.router, prefix="/api/v1/collaborators")`
- **Commit:** `feat(phase-2): collaborators API endpoints (T2.W2.5)`

### T2.W2.6 — arq worker task: reprocess_collaborator_mentions 🤖
- **Deps:** T2.W2.4
- `workers/tasks/reprocess_mentions.py`:
  - Receives `collaborator_id`
  - Calls existing Postgres function `reprocess_reviews_for_collaborator(id)`
    via service_role connection
  - Logs outcome via structlog
- Register task in arq worker settings
- **Commit:** `feat(phase-2): arq task for collaborator mention reprocessing (T2.W2.6)`

---

## Wave 3 — Frontend

### T2.W3.0 — Install frontend deps 🤖
- **Deps:** T2.W1.3
- `cd frontend && npm install @tanstack/react-table`
- **Commit:** `chore(phase-2): install @tanstack/react-table (T2.W3.0)`

### T2.W3.1 — API client + types 🤖
- **Deps:** T2.W3.0
- `frontend/src/lib/api/collaborators.ts`:
  - `fetchCollaborators(params)` → GET /api/v1/collaborators
  - `createCollaborator(data)` → POST
  - `updateCollaborator(id, data)` → PATCH
  - `deleteCollaborator(id)` → DELETE (soft)
  - `reactivateCollaborator(id)` → POST /reactivate
  - `mergeCollaborators(source_id, target_id)` → POST /merge
  - `exportCollaboratorsCSV(include_inactive)` → GET /export (blob download)
  - `importCollaboratorsCSV(file)` → POST /import
- `frontend/src/types/collaborator.ts` — TypeScript interfaces mirroring backend schemas
- **Commit:** `feat(phase-2): collaborator API client and types (T2.W3.1)`

### T2.W3.2 — CollaboratorsPage with TanStack Table 🤖
- **Deps:** T2.W3.1
- `frontend/src/pages/admin/CollaboratorsPage.tsx`:
  - TanStack Table with columns: Nome, Departamento, Cargo, Menções, Status, Ações
  - Server-fetched data (or client-side with useEffect for now; TanStack Query in Phase 3)
  - Search input with debounce
  - Toggle "Incluir inativos" (Switch component)
  - Pagination controls
  - "Novo Colaborador" button → opens CreateDialog
  - Row actions: Edit, Deactivate/Reactivate, Merge
- Add route `/admin/collaborators` in router, wrapped in RequireAuth + role check
- Add navigation link in layout (visible only for admin/manager)
- **Commit:** `feat(phase-2): CollaboratorsPage with TanStack Table (T2.W3.2)`

### T2.W3.3 — Create/Edit dialog 🤖 [P]
- **Deps:** T2.W3.2
- `frontend/src/components/collaborators/CollaboratorFormDialog.tsx`:
  - react-hook-form + zod validation
  - Fields: full_name (required), aliases (tag input or comma-separated),
    department (default "E-notariado"), position (optional)
  - Mode: "create" or "edit" (pre-populated)
  - On submit: call API, refresh table, show toast
- shadcn/ui components needed: Dialog, Toast (or Sonner)
- **Commit:** `feat(phase-2): CollaboratorFormDialog create/edit (T2.W3.3)`

### T2.W3.4 — Merge dialog 🤖 [P]
- **Deps:** T2.W3.2
- `frontend/src/components/collaborators/MergeDialog.tsx`:
  - Select source and target from dropdown (or pre-selected from table)
  - Preview panel: source name, target name, mentions to transfer,
    aliases to add
  - Confirmation button with "Essa ação não pode ser desfeita" warning
  - On confirm: call merge API, refresh table, show toast
- **Commit:** `feat(phase-2): MergeDialog with preview (T2.W3.4)`

### T2.W3.5 — CSV export/import UI 🤖
- **Deps:** T2.W3.2
- Export: button in toolbar → triggers blob download
- Import: button → file input dialog → upload → show results (created/errors)
- **Commit:** `feat(phase-2): CSV export/import UI (T2.W3.5)`

---

## Wave 4 — Tests & Validation

### T2.W4.1 — Backend pytest suite 🤖
- **Deps:** T2.W2.5, T2.W2.6
- `backend/tests/test_collaborators_crud.py` — CRUD operations (>=8 tests)
- `backend/tests/test_collaborators_merge.py` — merge logic (>=5 tests)
- `backend/tests/test_collaborators_csv.py` — CSV import/export (>=4 tests)
- `backend/tests/test_audit_log.py` — audit log creation + immutability (>=3 tests)
- Total target: >=20 new tests
- Run: `docker compose exec backend python -m pytest -q`
- **Commit:** `test(phase-2): backend pytest suite for collaborators (T2.W4.1)`

### T2.W4.2 — Frontend vitest suite 🤖 [P]
- **Deps:** T2.W3.3, T2.W3.4
- `frontend/src/__tests__/CollaboratorsPage.test.tsx` — table render, search, toggle
- `frontend/src/__tests__/CollaboratorFormDialog.test.tsx` — form validation
- `frontend/src/__tests__/MergeDialog.test.tsx` — preview, confirm
- `frontend/src/__tests__/collaborator-api.test.ts` — API client with MSW
- Total target: >=8 new tests
- Run: `cd frontend && npm test -- --run`
- **Commit:** `test(phase-2): frontend vitest suite for collaborators (T2.W4.2)`

### T2.W4.3 — Playwright E2E 🤖
- **Deps:** T2.W4.1, T2.W4.2
- `frontend/e2e/collaborators-crud.spec.ts` — create, edit, deactivate flow
- `frontend/e2e/collaborators-merge.spec.ts` — merge flow
- `frontend/e2e/collaborators-role-guard.spec.ts` — viewer cannot access
- Total: 3 spec files
- **Commit:** `test(phase-2): playwright E2E for collaborators (T2.W4.3)`

### T2.W4.4 — 🧍 Gate: apply migrations in prod ⚠
- **Deps:** T2.W4.1 green
- Apply `audit_log` migration via Management API
- Verify: `SELECT count(*) FROM audit_log` → 0
- **Commit:** `feat(phase-2): apply audit_log migration in prod (T2.W4.4)`

### T2.W4.5 — Smoke test prod 🤖
- **Deps:** T2.W4.4
- Verify endpoints via curl against running backend (if deployed) or
  document manual verification steps
- **Commit:** `docs(phase-2): smoke test evidence (T2.W4.5)`

---

## Wave 5 — Finalization

### T2.W5.1 — CHECKPOINT.md 🤖
- **Deps:** T2.W4.5
- Update `phase-2-collaborators-admin/CHECKPOINT.md` with:
  - Commit list, AC verification matrix, decisions, risks
- **Commit:** `docs(phase-2): finalize CHECKPOINT.md (T2.W5.1)`

### T2.W5.2 — mem_save + auto-memory update 🤖
- **Deps:** T2.W5.1
- `mem_save` type=session_summary
- Update `memory/project_phase_status.md`
- Update `memory/MEMORY.md`

### T2.W5.3 — Session opening prompt for Phase 3 🤖
- **Deps:** T2.W5.1
- Write `phase-3-visualization/SESSION-OPENING-PROMPT.md`
  following `docs/session-handoff-template.md`
- **Commit:** `docs(phase-3): session opening prompt handoff (T2.W5.3)`

### T2.W5.4 — 🧍 Gate: merge + tag + push
- **Deps:** T2.W5.3
- Merge `feat/phase-2-collaborators-admin` → main (rebase-merge)
- Tag `v0.0.4-phase-2`
- Push main + tags
- Delete feature branch

---

## Dependency Graph

```
W1.3 (gate) ──┬──> W2.0 (scaffolding) ──┬──> W2.1 [P] (audit_log migration)
              │                          ├──> W2.2 [P] (ORM models)
              │                          ├──> W2.3 [P] (schemas)
              │                          │
              │                          └──> W2.4 (service) ──┬──> W2.5 (endpoints)
              │                                                └──> W2.6 (arq task)
              │
              └──> W3.0 (frontend deps) ──> W3.1 (API client)
                                                  │
                                                  └──> W3.2 (page) ──┬──> W3.3 [P] (form)
                                                                     ├──> W3.4 [P] (merge)
                                                                     └──> W3.5 (CSV UI)

W2.5 + W2.6 ──> W4.1 (backend tests)
W3.3 + W3.4 ──> W4.2 [P] (frontend tests)
W4.1 + W4.2 ──> W4.3 (E2E) ──> W4.4 (🧍 prod migration)
W4.4 ──> W4.5 (smoke) ──> W5.1..W5.4
```

---

## Parallelism Strategy

- **W2.1, W2.2, W2.3** podem ser executadas em paralelo por subagents após W2.0
- **W3.0** pode iniciar em paralelo com W2 (frontend deps são independentes)
- **W3.3, W3.4** podem ser executadas em paralelo após W3.2
- **W4.1, W4.2** podem ser executadas em paralelo
- **Recomendação:** fan-out de 3 agentes em W2.1-W2.3, fan-out de 2 em W3.3-W3.4

---

## Estimated Commits

| # | Task | Message |
|---|---|---|
| 1 | T2.W1 | `docs(phase-2): SPEC.md + TASKS.md (T2.W1)` |
| 2 | T2.W2.0 | `chore(phase-2): scaffolding stubs and router wiring (T2.W2.0)` |
| 3 | T2.W2.1 | `feat(phase-2): audit_log migration and ORM model (T2.W2.1)` |
| 4 | T2.W2.2 | `feat(phase-2): Collaborator and ReviewCollaborator ORM models (T2.W2.2)` |
| 5 | T2.W2.3 | `feat(phase-2): Pydantic schemas for collaborators (T2.W2.3)` |
| 6 | T2.W2.4 | `feat(phase-2): CollaboratorService with CRUD, merge, CSV (T2.W2.4)` |
| 7 | T2.W2.5 | `feat(phase-2): collaborators API endpoints (T2.W2.5)` |
| 8 | T2.W2.6 | `feat(phase-2): arq task for mention reprocessing (T2.W2.6)` |
| 9 | T2.W3.0 | `chore(phase-2): install @tanstack/react-table (T2.W3.0)` |
| 10 | T2.W3.1 | `feat(phase-2): collaborator API client and types (T2.W3.1)` |
| 11 | T2.W3.2 | `feat(phase-2): CollaboratorsPage with TanStack Table (T2.W3.2)` |
| 12 | T2.W3.3 | `feat(phase-2): CollaboratorFormDialog create/edit (T2.W3.3)` |
| 13 | T2.W3.4 | `feat(phase-2): MergeDialog with preview (T2.W3.4)` |
| 14 | T2.W3.5 | `feat(phase-2): CSV export/import UI (T2.W3.5)` |
| 15 | T2.W4.1 | `test(phase-2): backend pytest suite (T2.W4.1)` |
| 16 | T2.W4.2 | `test(phase-2): frontend vitest suite (T2.W4.2)` |
| 17 | T2.W4.3 | `test(phase-2): playwright E2E (T2.W4.3)` |
| 18 | T2.W4.4 | `feat(phase-2): apply audit_log migration in prod (T2.W4.4)` |
| 19 | T2.W4.5 | `docs(phase-2): smoke test evidence (T2.W4.5)` |
| 20 | T2.W5.1 | `docs(phase-2): finalize CHECKPOINT.md (T2.W5.1)` |
| 21 | T2.W5.3 | `docs(phase-3): session opening prompt handoff (T2.W5.3)` |
