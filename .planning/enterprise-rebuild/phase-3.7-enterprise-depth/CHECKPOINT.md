# CHECKPOINT — Phase 3.7: Enterprise Data Depth & Interactivity

**Status:** DONE
**Branch:** `feat/phase-3.7-enterprise-depth`
**Tag:** `v0.0.5.2-phase-3.7`
**Session:** 1 (2026-04-14)

---

## Timeline

| Wave | Scope | Commits |
|------|-------|---------|
| Prep | Baseline migration function order fix for Postgres 17 | 1 |
| W1 | Backend extensions (schemas + services + endpoints) | 1 |
| W2 | Frontend base components (DeltaBadge, RatingHistogram, DateRangePicker, DataFreshnessIndicator, calendar) + hooks + types + api client | 1 |
| W3 | Dashboard with delta badges, rating histogram, reply-rate KPI, data freshness sidebar, hybrid date range picker | 1 |
| W4 | Reviews page URL state + multi-collaborator filter + sentiment filter + compact/expanded view toggle | 1 |
| W5 | Analytics with collaborator comparison overlay chart, reply-rate trendline, URL state | 1 |
| W6 | `/collaborators/:id` profile page with breadcrumb, KPI deltas, rating histogram, monthly chart, reviews table | 1 |
| Post-W6 | Link collaborator names in Dashboard "Top Mencionados" and Analytics table to `/collaborators/:id` | 1 |
| W7 | Tests — 17 new pytest + 11 new vitest (AC-3.7.18 / AC-3.7.19) | 2 |
| Post-W8 | Hotfixes found during visual validation: preset deltas + `my-performance` 500 | 1 |

Total: **11 commits** on branch.

---

## Commits

| # | Hash | Scope | Summary |
|---|------|-------|---------|
| 1 | `b6652c8` | db | Reorder baseline SQL wrapper functions to apply cleanly on fresh Postgres 17 |
| 2 | `9bac459` | backend | Phase 3.7 schemas + services + endpoints (overview compare_previous, trends reply_rate, data-status, collaborator profile, reviews filters) |
| 3 | `e9f3cd6` | frontend | W2 base components + hooks + types + api client |
| 4 | `b1128bd` | frontend | W3 Dashboard with deltas, histogram, reply-rate KPI, freshness sidebar, date range picker |
| 5 | `58d0207` | frontend | W4 Reviews with URL state, multi-filter by collaborator/sentiment, compact view |
| 6 | `6c2a309` | frontend | W5 Analytics with collaborator comparison chart, reply-rate line, URL state |
| 7 | `e4db296` | frontend | W6 CollaboratorProfilePage and route `/collaborators/:id` |
| 8 | `db558d9` | frontend | Link collaborator names in Dashboard + Analytics to profile page |
| 9 | `3ed9850` | frontend tests | W7 — 11 new vitest covering DeltaBadge, RatingHistogram, CollaboratorProfilePage, ReviewsPage |
| 10 | `06b934a` | backend tests | W7 — 17 new pytest covering compare_previous, rating_distribution, collaborator profile, review filters |
| 11 | `a8a38b3` | fix | Preset deltas (presetToDates emits both endpoints) + `my-performance` 500 for unlinked admin (`UUID(str(user_id))`) |

---

## Acceptance Criteria

| AC | Description | Evidence |
|----|-------------|----------|
| AC-3.7.1 | Delta badge per KPI card in Dashboard | `DeltaBadge` in 4 KPI cards + 5th (reply-rate) — screenshot `01_dashboard_default.png` / `kpi_zoom.png` |
| AC-3.7.2 | Rating distribution histogram inline in Nota Média card | `RatingHistogram compact` embedded in KPI card — same zoom screenshot |
| AC-3.7.3 | Reply rate as 5th KPI card | Card `Taxa de Resposta` with `MessageCircle`/`Reply` icon + delta badge |
| AC-3.7.4 | Data freshness indicator in sidebar | `DataFreshnessIndicator` in `AppLayout` — visible in every authenticated screenshot ("Dados de 04 de mar" in amber) |
| AC-3.7.5 | Custom date range picker in Dashboard + Analytics | `DateRangePicker` wraps shadcn Calendar with pt-BR locale — screenshot `02_dashboard_custom_range.png` |
| AC-3.7.6 | `/collaborators/:id` accessible to all authenticated roles | Route in `routes.tsx` under `RequireAuth` without `RequireRole` |
| AC-3.7.7 | KPI deltas in collaborator profile | Calculated via `useMemo` from `mentions_last_6m`/`mentions_prev_6m` and `avg_rating_last_6m`/`avg_rating_prev_6m` |
| AC-3.7.8 | Rating distribution in collaborator profile | `RatingHistogram` scoped to reviews mentioning the collaborator |
| AC-3.7.9 | Monthly evolution chart in collaborator profile | `ComposedChart` (bars + line) identical to `PerformancePage` — screenshots `09_profile_id1.png` / `10_profile_id6.png` |
| AC-3.7.10 | Recent reviews table with mention snippets in collaborator profile | `CollaboratorReviewsTable` with 120-char snippet column, rating border, reviewer in Title Case |
| AC-3.7.11 | Collaborator comparison chart in Analytics | `CollaboratorCompareChart` with up to 4 overlaid lines using `CHART_COLORS` — screenshot `07_analytics_compare_2.png` |
| AC-3.7.12 | Reply rate trendline in Analytics | Gray dashed line on right Y-axis (0–100) with checkbox toggle — screenshot `08_analytics_reply_rate.png` |
| AC-3.7.13 | Filter reviews by collaborator (multi-select, max 3) | `CollaboratorMultiSelect` in ReviewsPage toolbar — screenshot `05_reviews_filtered_multi.png` |
| AC-3.7.14 | Filter reviews by sentiment | `Sentimento` select with 5 options (Todos/Positivo/Neutro/Negativo/Não classificado) |
| AC-3.7.15 | URL state for Reviews filters | `useSearchParams` mirrors `rating`, `search`, `sort_by`, `sort_order`, `has_reply`, `collaborator_id[]`, `sentiment` |
| AC-3.7.16 | URL state for Analytics filters | `useSearchParams` mirrors `months` / `from`/`to` / `compare` (csv) |
| AC-3.7.17 | Compact/expanded mode in Reviews | Toggle `LayoutList`/`LayoutGrid` persisted in `localStorage('reviews-view-mode')` — screenshot `04_reviews_compact.png` |
| AC-3.7.18 | ≥15 new pytest | **17 new pytest**, all green (T3.7.W7.0 – W7.6) |
| AC-3.7.19 | ≥10 new vitest | **11 new vitest**, all green (T3.7.W7.7 – W7.11) |

---

## Test Suites

| Suite | Before 3.7 | After 3.7 | Delta |
|-------|-----------|----------|-------|
| Backend pytest (runnable modules) | 76 passed / 21 failed | 93 passed / 21 failed | **+17 passed** |
| Frontend vitest | 72 passed (17 files) | 83 passed (20 files) | **+11 passed** |

The 21 pre-existing backend failures are concentrated in `test_collaborators_crud.py`, `test_collaborators_csv.py`, `test_collaborators_merge.py`, and `test_audit_log.py`. All share the same symptom: SQLite test fixture DDL is stale relative to the ORM model (`collaborators.user_id` column exists in ORM since Phase 3.5 but was never added to the test DDL). Confirmed pre-existing via `git stash` against `main`. **Not in scope for Phase 3.7** — flagged for a dedicated follow-up.

---

## New Backend Endpoints

| Method | Path | Response | Added by |
|--------|------|----------|----------|
| GET | `/api/v1/metrics/overview?compare_previous=true&date_from&date_to` | `MetricsOverviewOut` with `rating_distribution`, `reply_rate_pct`, `previous_period` | W1 |
| GET | `/api/v1/metrics/data-status` | `DataStatusOut` (last_review_date, last_collection_run, total_reviews, days_since_last_review) | W1 |
| GET | `/api/v1/collaborators/:id/profile` | `CollaboratorProfileOut` (full profile + 6m/prev_6m baselines + rating distribution + 12m monthly + 20 recent reviews) | W1 |
| GET | `/api/v1/metrics/trends` | `TrendsOut` with per-month `reply_rate_pct` | W1 (extended) |
| GET | `/api/v1/reviews?collaborator_id&sentiment` | `ReviewListResponse` (extended filters) | W1 (extended) |

---

## New Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| `DeltaBadge` | `src/components/ui/DeltaBadge.tsx` | Directional delta (↑ green / ↓ red / → gray) with aria-label |
| `RatingHistogram` | `src/components/charts/RatingHistogram.tsx` | 5-bar CSS histogram (5★→1★), compact variant, zero Recharts |
| `DateRangePicker` | `src/components/ui/DateRangePicker.tsx` | pt-BR range picker over react-day-picker@9 |
| `Calendar` | `src/components/ui/calendar.tsx` | Wrapper around react-day-picker@9 with pt-BR locale + Lucide chevrons |
| `DataFreshnessIndicator` | `src/components/layout/DataFreshnessIndicator.tsx` | Sidebar widget with muted/amber/red by age |
| `CollaboratorCompareChart` | `src/components/charts/CollaboratorCompareChart.tsx` | Recharts overlay of up to 4 collaborator lines |
| `CollaboratorMultiSelect` | `src/components/reviews/CollaboratorMultiSelect.tsx` | Multi-select chips with max 3 |
| `CollaboratorReviewsTable` | `src/components/collaborators/CollaboratorReviewsTable.tsx` | Table for profile page with 120-char snippets + detail dialog |
| `CollaboratorProfilePage` | `src/pages/CollaboratorProfilePage.tsx` | Full profile at `/collaborators/:id` |

---

## New Frontend Hooks

| Hook | Change |
|------|--------|
| `useMetricsOverview` | Accepts `compare_previous` |
| `useReviews` | Accepts `collaborator_id[]`, `sentiment` |
| `useCollaboratorProfile(id)` | New — fetches `/api/v1/collaborators/:id/profile` |
| `useDataStatus` | New — 5 min stale time, no refetch on focus |

---

## Dependencies Added

- `react-day-picker@9.14.0` — calendar primitive for DateRangePicker
- `date-fns@4.x` — pt-BR locale formatting (was already transitive via Recharts)

---

## Known follow-ups (out of Phase 3.7 scope)

1. **21 stale SQLite DDL test failures** in `test_collaborators_*.py` and `test_audit_log.py`. All fail with `table collaborators has no column named user_id`. Pre-existing since Phase 3.5 landed the `user_id` ORM field. Fix: rebuild the SQLite test fixture schema from the ORM models (or migrate to Postgres-based integration tests).
2. **Trends endpoint does not yet accept `date_from`/`date_to`**. In custom-range mode, Dashboard and Analytics approximate with `months=60` (full history) for the trends chart. Extending the endpoint is a 10-line change but was out of W1 scope.
3. **Growth metric in CollaboratorProfilePage is negative for every collaborator** because it compares "last month" (post data-freeze) with historical average. Data quality artifact — Phase 4 (scraper) automatically resolves when fresh data flows again.
4. **Delta baseline is a full-zero window** for the 12-month preset since all reviews in the local seed snapshot are concentrated in 2025-09 through 2026-03. When the scraper pipeline is restored in Phase 4, the deltas will reflect meaningful month-over-month movement.

---

## Infrastructure notes (dev-only, not merged)

- `supabase/config.toml` has local-only enablement of `[api]` and `[auth]` sections to allow `supabase start` to boot a full stack with GoTrue. This change stays in the working tree and is intentionally **not committed** — cloud deploys keep the config in its minimal state.
- `docker-compose.local.yml` (gitignored) adds `extra_hosts: host.docker.internal:host-gateway` to `backend` and `workers` so containers can reach the local Supabase stack.
- `backend/.env.local` uses `postgresql+asyncpg://postgres:postgres@host.docker.internal:54322/postgres` and `SUPABASE_URL=http://host.docker.internal:54321`. `SUPABASE_JWT_ISSUER` is explicitly pinned to `http://127.0.0.1:54321/auth/v1` because GoTrue signs tokens with its bind URL regardless of the gateway hostname.
