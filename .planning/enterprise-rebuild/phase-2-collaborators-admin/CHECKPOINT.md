# CHECKPOINT — Phase 2: Collaborators Admin Panel

**Status:** DONE (pending prod migration gate T2.W4.4)
**Branch:** `feat/phase-2-collaborators-admin`
**Tag:** `v0.0.4-phase-2` (pending)
**Session:** 1 (2026-04-10)

---

## Timeline

| Wave | Scope | Duration |
|---|---|---|
| W1 | SPEC + TASKS | ~15min |
| W2 | Backend (migration, ORM, service, endpoints, worker) | ~25min |
| W3 | Frontend (TanStack Table, dialogs, CSV UI) | ~20min |
| W4 | Tests (21 backend, 15 frontend, 6 E2E) | ~15min |
| W5 | Finalization | ~10min |

---

## Commits (4 new on this branch)

| # | Hash | Task | Summary |
|---|---|---|---|
| 1 | `b6fe8ff` | T2.W1 | SPEC.md + TASKS.md (20 ACs, 5 waves) |
| 2 | `1334a2f` | T2.W2 | Backend: migration, ORM, service, endpoints, arq task |
| 3 | `925dd3e` | T2.W3 | Frontend: TanStack Table page, dialogs, CSV UI, RequireRole |
| 4 | `1cbd385` | T2.W4 | Tests: 21 pytest + 15 vitest + 6 Playwright E2E |

---

## Acceptance Criteria

| AC | Description | Evidence |
|---|---|---|
| AC-2.1 | List active collaborators | test_list_collaborators_with_data, test_list_excludes_inactive |
| AC-2.2 | List including inactive | test_list_includes_inactive_when_requested |
| AC-2.3 | Search by name/alias | _base_query search logic, CollaboratorsPage search input |
| AC-2.4 | Create collaborator | test_create_collaborator |
| AC-2.5 | Duplicate name 409 | test_create_duplicate_name_409 |
| AC-2.6 | Update collaborator | test_update_collaborator |
| AC-2.7 | Aliases change triggers reprocess | collaborator_service.update_collaborator logs enqueue_reprocess |
| AC-2.8 | Soft-delete (deactivate) | test_deactivate_collaborator |
| AC-2.9 | Reactivate | test_reactivate_collaborator |
| AC-2.10 | Merge collaborators | test_merge_transfers_mentions, test_merge_adds_aliases |
| AC-2.11 | Merge self blocked | test_merge_self_returns_400 |
| AC-2.12 | CSV export | test_export_csv |
| AC-2.13 | CSV import creates | test_import_csv_creates |
| AC-2.14 | CSV import validation | test_import_csv_missing_name |
| AC-2.15 | Viewer blocked (backend) | Role gate via require_role("admin", "manager") |
| AC-2.16 | Viewer blocked (frontend) | RequireRole.test.tsx, collaborators-role-guard.spec.ts |
| AC-2.17 | Audit log immutability | test_create/update/merge_writes_audit_log |
| AC-2.18 | TanStack Table renders | CollaboratorsPage.test.tsx |
| AC-2.19 | Merge dialog preview | MergeDialog component, collaborators-merge.spec.ts |
| AC-2.20 | E2E crud flow | collaborators-crud.spec.ts |

---

## Test Suites

| Suite | Count | Status |
|---|---|---|
| Backend pytest | 101 (21 new) | All green |
| Frontend vitest | 31 (15 new) | All green |
| Playwright E2E | 6 specs (3 new files) | Created |

---

## Technical Decisions

| ID | Decision | Rationale |
|---|---|---|
| D2.1 | audit_log as separate table (not triggers) | Backend writes in same transaction; full control over diff format |
| D2.2 | Merge uses SELECT FOR UPDATE | Prevents concurrent merge race conditions |
| D2.3 | ON CONFLICT in merge keeps higher match_score | Preserves best-quality mention data |
| D2.4 | CSV import is upsert-by-full_name | Idempotent re-imports; no duplicate risk |
| D2.5 | Frontend uses useEffect+fetch (not TanStack Query) | TanStack Query migration in Phase 3; keeps Phase 2 focused |
| D2.6 | shadcn v4 (base-ui) Select/DropdownMenu | No asChild prop; direct render pattern |

---

## Files Created/Modified

### Backend (new)
- `supabase/migrations/20260410200000_audit_log.sql`
- `backend/app/db/models/audit_log.py`
- `backend/app/db/models/collaborator.py`
- `backend/app/schemas/collaborator.py`
- `backend/app/services/collaborator_service.py`
- `backend/app/api/v1/collaborators.py`
- `workers/app/tasks/reprocess_mentions.py`
- `backend/tests/conftest.py` (new shared conftest)
- `backend/tests/test_collaborators_crud.py`
- `backend/tests/test_collaborators_merge.py`
- `backend/tests/test_collaborators_csv.py`
- `backend/tests/test_audit_log.py`

### Backend (modified)
- `backend/app/db/models/__init__.py` — added imports
- `backend/app/main.py` — wired collaborators router
- `workers/app/main.py` — registered reprocess task

### Frontend (new)
- `frontend/src/types/collaborator.ts`
- `frontend/src/lib/api/collaborators.ts`
- `frontend/src/pages/admin/CollaboratorsPage.tsx`
- `frontend/src/components/collaborators/CollaboratorFormDialog.tsx`
- `frontend/src/components/collaborators/MergeDialog.tsx`
- `frontend/src/components/auth/RequireRole.tsx`
- 7 shadcn/ui components (dialog, badge, switch, select, separator, dropdown-menu, table)
- `frontend/src/pages/admin/CollaboratorsPage.test.tsx`
- `frontend/src/components/collaborators/CollaboratorFormDialog.test.tsx`
- `frontend/src/components/auth/RequireRole.test.tsx`
- `frontend/src/lib/api/collaborators.test.ts`
- `frontend/e2e/collaborators-crud.spec.ts`
- `frontend/e2e/collaborators-merge.spec.ts`
- `frontend/e2e/collaborators-role-guard.spec.ts`

### Frontend (modified)
- `frontend/package.json` — added @tanstack/react-table
- `frontend/src/routes.tsx` — added /admin/collaborators route
- `frontend/src/test/mocks/handlers.ts` — added collaborator MSW handlers

---

## Security State Post-Phase 2

- 16 tables in `public` (15 Phase 1 + audit_log) — pending prod migration
- audit_log has RLS deny_all + FORCE ROW LEVEL SECURITY
- All collaborator endpoints gated by require_role("admin", "manager")
- Frontend RequireRole guard on /admin/collaborators
- No new secrets or credentials introduced

---

## Backlog for Future Phases

- **Phase 3:** TanStack Query migration, code-splitting, dashboard pages
- **Phase 3:** Collaborator mention counts on dashboard (cross-page)
- **Phase 4:** Wire reprocess_collaborator_mentions arq task to actual job queue
- **Phase 5:** Full Playwright E2E with real backend (currently mocked)
- **Cleanup:** Remove unused `python-jose` dependency (from Phase 1)
