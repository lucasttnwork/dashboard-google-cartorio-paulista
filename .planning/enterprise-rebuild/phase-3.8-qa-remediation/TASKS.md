# TASKS — Phase 3.8: QA Remediation + Time Window Cascading + Daily Granularity

> **SPEC:** `phase-3.8-qa-remediation/SPEC.md`
> **Branches mãe:** worktrees `worktree-phase-3.8-backend`, `worktree-phase-3.8-components`, `worktree-phase-3.8-pages`
> **Metodologia:** autonomous-harness — 3 workers paralelos, reviewer hostil no fim, merge em main, tag v0.0.5.3-phase-3.8

---

## Work packages (3 workers paralelos)

### Package A — Backend (`worktree-phase-3.8-backend`)

| Task | Descrição |
|------|-----------|
| A.1 | `GET /metrics/trends` aceita `date_from: str \| None`, `date_to: str \| None`, `granularity: Literal["month","day"] = "month"` — ver SPEC §3.8.A |
| A.2 | `get_trends()` em `metrics_service.py` ramifica por granularidade: quando `day`, trocar `date_trunc('month', ...)` por `date_trunc('day', ...)` e popular `MonthData.day` em vez de `MonthData.month` |
| A.3 | `MonthData` schema em `schemas/metrics.py` ganha `day: str \| None = None` e `TrendsOut` ganha `granularity: str = "month"` |
| A.4 | `GET /metrics/collaborator-mentions` aceita `date_from`, `date_to` — ver SPEC §3.8.B |
| A.5 | `get_collaborator_mentions()` aceita os mesmos params e aplica filtro SQL; o sub-query de `monthly[]` também herda os dois filtros |
| A.6 | pytest novos (≥ 8 testes): `trends` diário, `trends` com date_from/date_to, `collaborator_mentions` com date_from/date_to, sanity de contagens |
| A.7 | Smoke test via curl depois que os endpoints voltarem: `/trends?granularity=day&date_from=2026-01-01&date_to=2026-02-01` deve retornar 200 e ≥ 28 entradas |
| A.8 | Commit atômico: `feat(backend): phase 3.8 — date range + daily granularity in trends & collaborator-mentions` |

**Arquivos tocados (somente):**
- `backend/app/api/v1/metrics.py`
- `backend/app/services/metrics_service.py`
- `backend/app/schemas/metrics.py`
- `backend/tests/test_metrics.py`

**Gate de DONE:** pytest ≥ 8 novos verdes; curl smoke-test 200; commit criado; `[CC-WORKER phase-3.8-backend] DONE <hash>` escrito em `.orchestrator/inbox/`.

---

### Package B — Frontend Components + A11y (`worktree-phase-3.8-components`)

| Task | Descrição |
|------|-----------|
| B.1 | **F1** Calendar pointer events: abrir `frontend/src/components/ui/calendar.tsx`, identificar por que o caption `<div class="flex justify-center pt-1">` intercepta clicks nos botões de navegação; corrigir via `pointer-events-none` no caption + `pointer-events-auto` nos filhos, ou reordenar DOM/z-index. Verificar manualmente com curl do frontend após rebuild |
| B.2 | **F2 + F3 + A5** `CollaboratorMultiSelect.tsx`: (1) expor itens via ARIA role="option" ou confirmar que o base-ui Select já cuida disso e falta só um atributo de Portal; (2) cap visual E funcional em 3 — se o hook receber 4 IDs, descartar o 4º e também retornar apenas 3 no param que sobe para URL. O cap deve valer para: (a) seleção incremental via clique, (b) carregamento inicial de URL com 4+ IDs, (c) sincronização via useSearchParams |
| B.3 | **F4** `DateRangePicker.tsx`: configurar react-day-picker para manter aberto até `range.from && range.to` ambos definidos. Atualmente fecha no primeiro clique. Padrão react-day-picker 9: `mode="range"` já faz isso nativo — provavelmente o wrapper está fechando via `onSelect` prematuro. Remover fechamento automático no primeiro clique |
| B.4 | **F6** Aceitar `?sentiment=positive`/`neutral`/`negative`/`unknown` como aliases de `pos`/`neu`/`neg`/`unknown` no parse de URL de `ReviewsPage.tsx`. Canonicalizar para os valores curtos antes de enviar ao backend. NÃO re-escrever a URL do usuário — só normalizar internamente |
| B.5 | **A1** `AppLayout.tsx`: garantir que só existe um `<h1>` por página — o título "Cartório Paulista" na sidebar vira `<p>` ou `<span>` com classe de tipografia; o `<h1>` real fica no header da rota |
| B.6 | **A2** `AppLayout.tsx`: adicionar skip link `<a href="#main-content" class="sr-only focus:not-sr-only">Pular para conteúdo principal</a>` no topo, com `id="main-content"` no `<main>` |
| B.7 | **A3** `ReviewDetailDialog.tsx` (ou arquivo correspondente — buscar por uso do componente Close): botão close recebe `aria-label="Fechar detalhes da avaliação"` |
| B.8 | **A4** Hidden combobox inputs (do período) recebem `aria-label="Filtro de período"` ou equivalente |
| B.9 | vitest novos (≥ 3): a11y do CollaboratorMultiSelect (cap em 3), sentiment alias `positive → pos`, skip link presente no layout |
| B.10 | Commit atômico: `fix(frontend): phase 3.8 — calendar, multi-select, a11y, sentiment aliases` |

**Arquivos tocados (somente):**
- `frontend/src/components/ui/calendar.tsx`
- `frontend/src/components/ui/DateRangePicker.tsx`
- `frontend/src/components/reviews/CollaboratorMultiSelect.tsx`
- `frontend/src/components/layout/AppLayout.tsx`
- `frontend/src/pages/ReviewsPage.tsx` (apenas partes relacionadas a F4 sentiment alias e F3 URL normalization — NÃO tocar o resto)
- Arquivo do `ReviewDetailDialog` (buscar)
- `frontend/src/**/*.test.tsx` para os testes novos

**PROIBIDO tocar:** `DashboardPage.tsx`, `AnalyticsPage.tsx`, `hooks/use-metrics.ts`, `lib/api/metrics.ts`, `types/metrics.ts`, backend.

**Gate de DONE:** `cd frontend && npx tsc -b --noEmit` zero erros; `npx vitest run` tudo verde (83 + ≥ 3 novos); rebuild frontend (`docker compose ... up -d --build frontend`) OK; commit criado; `[CC-WORKER phase-3.8-components] DONE <hash>` em inbox.

---

### Package C — Frontend Pages + Cascading + Daily (`worktree-phase-3.8-pages`)

| Task | Descrição |
|------|-----------|
| C.1 | **F5** `kpiDeltas()` em `DashboardPage.tsx`: quando `overview.previous_period.total_reviews === 0`, retornar `{ total: null, avg: null, fiveStar: null, replyRate: null }` — o DeltaBadge já renderiza "Estável" para null |
| C.2 | **C1 + C3** Estender `useTrends(params)` para aceitar `date_from?: string, date_to?: string, granularity?: "month" \| "day"`. Idem `useCollaboratorMentions`. Atualizar `fetchTrends`/`fetchCollaboratorMentions` em `lib/api/metrics.ts`. Atualizar queryKeys. |
| C.3 | **C4** `DashboardPage.tsx`: computar `dateParams` (já existe) e passar o MESMO objeto para `useTrends` e `useCollaboratorMentions`. Atualmente ambos recebem só `months={trendsMonths}`. Passar `date_from`/`date_to` quando presentes. |
| C.4 | **C5** `AnalyticsPage.tsx`: mesma lógica — extrair `dateParams` a partir do modo (preset ou custom range) e propagar para `useTrends` E `useCollaboratorMentions`. O comparativo de colaboradores (que consome `monthly[]`) vai passar a refletir o range. |
| C.5 | **C6** Auto-granularity: função helper `pickGranularity({ monthsPreset, dateFrom, dateTo })` que retorna `"day"` quando o range é ≤ 60 dias, `"month"` caso contrário. Usar tanto em `DashboardPage` quanto em `AnalyticsPage`. Passar `granularity` para `useTrends`. |
| C.6 | **C6 UI** `TrendsChart` (atualmente inline no DashboardPage; e o `LineChart` de Analytics): ler `granularity` + `day`/`month` do shape de resposta e usar o campo adequado no eixo X. Formato de tick: dia → `"03 fev"`, mês → `"fev 25"` (usando date-fns pt-BR) |
| C.7 | `types/metrics.ts`: estender `MonthData` com `day?: string` e `TrendsOut` com `granularity?: "month" \| "day"` |
| C.8 | vitest novos (≥ 3): kpiDeltas com previous=0 → null, useTrends query key inclui granularity, DashboardPage renderiza sem crash quando trends retorna day-granularity |
| C.9 | Commit atômico: `feat(frontend): phase 3.8 — time window cascading + daily granularity + delta N/D` |

**Arquivos tocados (somente):**
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/pages/AnalyticsPage.tsx`
- `frontend/src/hooks/use-metrics.ts`
- `frontend/src/lib/api/metrics.ts`
- `frontend/src/types/metrics.ts`
- Possível novo helper `frontend/src/lib/period.ts` ou similar para `pickGranularity`
- `frontend/src/**/*.test.tsx` para os testes

**PROIBIDO tocar:** components/ui/*, components/reviews/*, components/layout/*, ReviewsPage, backend.

**Gate de DONE:** `npx tsc -b --noEmit` zero erros; `npx vitest run` tudo verde (83 + ≥ 3); rebuild frontend OK; `/dashboard` mostra deltas corretos após smoke teste manual via curl (via browser não precisa); `[CC-WORKER phase-3.8-pages] DONE <hash>` em inbox.

**Dependência soft:** C consome os endpoints que A entrega. C pode implementar contra os contratos definidos na SPEC mesmo antes de A commitar — o merge final junta tudo. Se a sessão pai tem que re-rodar o frontend em runtime antes de A merge, aceite que C ainda não funciona 100% até A entrar.

---

## Cronograma agregado

```
    A (backend)         B (components)          C (pages)
    │                   │                       │
    │ (paralelos — diferentes arquivos, sem conflito)
    │                   │                       │
    └───────────────────┴───────────────────────┘
                        │
                        ▼
              Reviewer hostil
              (worktree-phase-3.8-review)
                        │
                        ▼
              Mother decide: merge ou correction
                        │
                        ▼
              Merge A + B + C em main
              Tag v0.0.5.3-phase-3.8
              Update CHECKPOINT.md
              Push (com autorização)
```

---

## Signaling protocol (autonomous-harness)

Cada worker, ao concluir, escreve um arquivo em `.orchestrator/inbox/` com formato:

```
.orchestrator/inbox/<unix-ts>-<slug>-<STATUS>.txt
```

Conteúdo:

```
[CC-WORKER <slug>] <STATUS> — <short details>
<multi-line context: commit hash, counts, evidence>
```

Statuses válidos:
- `DONE` — scope complete, commit made
- `BLOCKED` — precisa da mãe, inclui diagnóstico e opções
- `NEEDS_INPUT` — decisão pequena que a mãe pode resolver
- `PROGRESS` — informativo, opcional

A mãe monitora `.orchestrator/inbox/` via `Monitor` (inotifywait ou polling).

## Worktree & branches

| Package | Worktree path | Branch |
|---------|---------------|--------|
| A | `/home/lucas/Documentos/CODE/dashboard-cartorio-phase-3.8-backend` | `worktree-phase-3.8-backend` |
| B | `/home/lucas/Documentos/CODE/dashboard-cartorio-phase-3.8-components` | `worktree-phase-3.8-components` |
| C | `/home/lucas/Documentos/CODE/dashboard-cartorio-phase-3.8-pages` | `worktree-phase-3.8-pages` |

Criados via `git worktree add ../dashboard-cartorio-phase-3.8-<slug> -b worktree-phase-3.8-<slug> main`.

## Finalização (W9-equivalente)

1. Todos DONE → reviewer session em outra tab (sem worktree, roda em `main`)
2. Reviewer emite verdict YES/NO em `.orchestrator/inbox/<ts>-reviewer-DONE.txt`
3. Mãe merge A → main, B → main, C → main (sequencial via `git merge --no-ff` em main)
4. Remove worktrees, delete branches
5. Atualiza `CHECKPOINT.md` da 3.8
6. Tag `v0.0.5.3-phase-3.8`
7. Present ao humano para push final
