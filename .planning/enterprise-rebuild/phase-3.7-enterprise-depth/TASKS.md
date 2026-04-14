# TASKS — Phase 3.7: Enterprise Data Depth & Interactivity

> **SPEC:** `phase-3.7-enterprise-depth/SPEC.md`
> **Branch:** `feat/phase-3.7-enterprise-depth`
> **Status:** PRONTO PARA EXECUÇÃO

---

## Legenda

- :robot: Agente executa autonomamente
- :standing_person: Gate humano — aguardar aprovação
- [P] Paralelizável com outras tasks do mesmo wave
- [S] Sequencial — depende do anterior

---

## Wave 1 — Backend: extensões de queries e novos endpoints

> **Critério de saída:** todos os novos endpoints respondem 200 com dados corretos
> via `curl` ou teste direto; `pytest` existente permanece 100% verde.

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.7.W1.0 | :robot: | — | Criar branch `feat/phase-3.7-enterprise-depth` a partir de `main` |
| T3.7.W1.1 | :robot: | [P] | **Schema:** adicionar `reply_rate_pct: float` e `rating_distribution: dict[str, int]` a `MetricsOverviewOut`; adicionar `PreviousPeriodOut` como schema opcional |
| T3.7.W1.2 | :robot: | [P] | **Schema:** adicionar `reply_rate_pct: float` a `MonthData` em `schemas/metrics.py` |
| T3.7.W1.3 | :robot: | [P] | **Schema:** criar `CollaboratorProfileOut` e `CollaboratorReviewOut` em `schemas/collaborator.py` (ver SPEC §3.7.D) |
| T3.7.W1.4 | :robot: | [P] | **Schema:** criar `DataStatusOut` em `schemas/metrics.py` |
| T3.7.W1.5 | :robot: | [S] após W1.1 | **Service:** modificar `get_overview` — adicionar `rating_distribution` (5 CASE no mesmo SELECT), `reply_rate_pct`, e bloco `compare_previous` (re-executa mesma query para período anterior de mesma duração quando `compare_previous=True`) |
| T3.7.W1.6 | :robot: | [S] após W1.2 | **Service:** modificar `get_trends` — adicionar `reply_rate_pct` por mês no GROUP BY SQL (COUNT(reply_text IS NOT NULL) / COUNT(*) * 100) |
| T3.7.W1.7 | :robot: | [S] após W1.3 | **Service:** criar `get_collaborator_profile(session, collaborator_id)` em `metrics_service.py` — 4 queries: (a) dados básicos + mentions total + avg; (b) ranking; (c) rating_distribution via COUNT CASE; (d) monthly 12m; (e) recent_reviews últimas 20 com JOIN review_collaborators para mention_snippet |
| T3.7.W1.8 | :robot: | [S] após W1.4 | **Service:** criar `get_data_status(session)` em `metrics_service.py` — MAX(create_time) de reviews, MAX(completed_at) de collection_runs WHERE status='completed', COUNT total |
| T3.7.W1.9 | :robot: | [S] após W1.5 | **API:** atualizar `GET /api/v1/metrics/overview` — aceitar `compare_previous: bool = Query(False)` e passar para service |
| T3.7.W1.10 | :robot: | [S] após W1.8 | **API:** criar `GET /api/v1/metrics/data-status` em `metrics.py` — chamar `get_data_status`, return `DataStatusOut` |
| T3.7.W1.11 | :robot: | [S] após W1.7 | **API:** criar `GET /api/v1/collaborators/{collaborator_id}/profile` em `collaborators.py` — `require_authenticated` (todos os roles); 404 se não encontrado |
| T3.7.W1.12 | :robot: | [P] | **Service:** modificar `list_reviews` — adicionar params `collaborator_id: list[int] \| None = None` e `sentiment: str \| None = None`; quando `collaborator_id` presente, INNER JOIN `review_collaborators` com `ANY(:ids)`; quando `sentiment` presente, LEFT JOIN `review_labels` e filtrar |
| T3.7.W1.13 | :robot: | [S] após W1.12 | **API:** atualizar `GET /api/v1/reviews` — aceitar `collaborator_id: list[int] = Query(default=[])` e `sentiment: str \| None = Query(None)`; passar para service |

---

## Wave 2 — Frontend: componentes base reutilizáveis

> **Critério de saída:** componentes renderizam isoladamente em vitest; nenhuma
> regressão em testes existentes.

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.7.W2.0 | :robot: | [P] | Adicionar componente `calendar.tsx` do shadcn/ui ao projeto (se não existe) via `npx shadcn@latest add calendar` dentro do container, ou copiar template manualmente |
| T3.7.W2.1 | :robot: | [P] | **`DeltaBadge`** (`src/components/ui/DeltaBadge.tsx`): props `value: number \| null`, `suffix?: string`. Renderiza `↑ +X` verde, `↓ −X` vermelho, `→ Estável` cinza para null/zero. Usa `formatDecimal` existente |
| T3.7.W2.2 | :robot: | [P] | **`RatingHistogram`** (`src/components/charts/RatingHistogram.tsx`): props `distribution: Record<string, number>`. Renderiza 5 linhas de label + barra CSS `width: pct%` + count. Zero dependência de Recharts. Tooltip nativo HTML title |
| T3.7.W2.3 | :robot: | [P] | **`DateRangePicker`** (`src/components/ui/DateRangePicker.tsx`): wrapper em cima do `Calendar` shadcn com seleção de range. Props: `value: {from: Date \| null, to: Date \| null}`, `onChange`, `placeholder`. Formatação PT-BR ("15 jan – 31 mar 2025") |
| T3.7.W2.4 | :robot: | [P] | **`DataFreshnessIndicator`** (`src/components/layout/DataFreshnessIndicator.tsx`): consome `useDataStatus()`. Exibe data compacta em cinza/amber/vermelho conforme AC-3.7.4. Tooltip com data do último collection_run |
| T3.7.W2.5 | :robot: | [P] | **Hooks:** criar `useCollaboratorProfile(id: number)` e `useDataStatus()` em `src/hooks/use-metrics.ts`. Adicionar `compare_previous` param a `useMetricsOverview`. Adicionar `collaborator_id` e `sentiment` params a `useReviews` |
| T3.7.W2.6 | :robot: | [P] | **Types:** adicionar `PreviousPeriodOut`, campos novos a `MetricsOverview`, `CollaboratorProfileOut`, `CollaboratorReviewOut`, `DataStatusOut` em `src/types/metrics.ts` e `src/types/collaborator.ts` |
| T3.7.W2.7 | :robot: | [P] | **API client:** adicionar funções `fetchCollaboratorProfile(id)` e `fetchDataStatus()` em `src/lib/api/metrics.ts`; atualizar `fetchReviews` para aceitar `collaborator_id[]` e `sentiment` |

---

## Wave 3 — Frontend: Dashboard melhorado

> **Critério de saída:** Dashboard rodando no Docker exibe todos os KPI cards com
> delta, histograma de rating, KPI de taxa de resposta, data freshness no sidebar,
> e seletor de período customizado funcional.

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.7.W3.0 | :robot: | [S] W2.1 | **KPI cards com delta (AC-3.7.1):** modificar `DashboardPage` — chamar `useMetricsOverview({..., compare_previous: true})`; adicionar `DeltaBadge` abaixo do valor em cada KPI card (total_reviews, avg_rating, five_star_pct, reply_rate_pct) |
| T3.7.W3.1 | :robot: | [S] W2.2 | **Rating histogram (AC-3.7.2):** no KPI card de "Nota Média", inserir `RatingHistogram` abaixo do delta badge |
| T3.7.W3.2 | :robot: | [S] W2.1 | **Taxa de resposta KPI (AC-3.7.3):** adicionar 5º KPI card "Taxa de Resposta" ao grid do Dashboard usando `five_star_pct` pattern; mostrar `reply_rate_pct` + `DeltaBadge` |
| T3.7.W3.3 | :robot: | [S] W2.4 | **Data freshness no sidebar (AC-3.7.4):** inserir `DataFreshnessIndicator` no `AppLayout.tsx`, abaixo do menu de navegação e acima da seção de usuário |
| T3.7.W3.4 | :robot: | [S] W2.3 | **Date range picker no Dashboard (AC-3.7.5):** substituir o `Select` de período por um componente híbrido: opções fixas (3/6/12/tudo) + opção "Personalizado" que exibe `DateRangePicker`; quando customizado, label compacto no trigger |
| T3.7.W3.5 | :robot: | [S] W3.0 | Rebuild Docker + login + screenshot Dashboard → validar 5 KPI cards, deltas, histograma, freshness indicator |

---

## Wave 4 — Frontend: Reviews page melhorada

> **Critério de saída:** Reviews page com filtros por colaborador e sentimento,
> modo compacto funcional, URLs com estado.

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.7.W4.0 | :robot: | [S] W2.5 | **URL state (AC-3.7.15):** migrar estado de filtros de `useState` para `useSearchParams` na Reviews page — mapear `rating`, `search`, `sort_by`, `sort_order`, `has_reply`, `collaborator_id`, `sentiment` para query params; inicializar state a partir da URL |
| T3.7.W4.1 | :robot: | [S] W4.0 | **Filtro por colaborador (AC-3.7.13):** adicionar multi-select de colaboradores ativos na barra de filtros da Reviews page (máx 3 chips); usa lista de `useCollaboratorMentions` já em cache (sem nova query); ao selecionar, atualiza `collaborator_id` na URL |
| T3.7.W4.2 | :robot: | [S] W4.0 | **Filtro por sentimento (AC-3.7.14):** adicionar Select "Sentimento" (Todos / Positivo / Neutro / Negativo / Não classificado) na barra de filtros; mapeia para `sentiment` na URL |
| T3.7.W4.3 | :robot: | [P] W4.0 | **Modo compacto/expandido (AC-3.7.17):** toggle ícone `LayoutList`/`LayoutGrid` no topo; modo compacto = `<tr>` por review com colunas Data, Nota (badge), Revisor, Trecho (60 chars), Colaboradores (chips); persiste em `localStorage['reviews-view-mode']`; modo expandido = card atual |
| T3.7.W4.4 | :robot: | [S] W4.1–W4.3 | Rebuild Docker + screenshot Reviews page → validar filtros ativos na URL, modo compacto, chips de colaborador |

---

## Wave 5 — Frontend: Analytics melhorado

> **Critério de saída:** Analytics com comparativo de colaboradores funcional e
> taxa de resposta como linha opcional.

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.7.W5.0 | :robot: | [S] W2.5 | **URL state Analytics (AC-3.7.16):** migrar seletor de período e seleção de colaboradores para `useSearchParams` em `AnalyticsPage`; params: `months`, `compare` (lista de ids) |
| T3.7.W5.1 | :robot: | [S] W2.3 | **Date range picker em Analytics (AC-3.7.5):** mesmo componente híbrido da W3.4; substituir o Select de Analytics; propagate para `useTrends` e `useCollaboratorMentions` |
| T3.7.W5.2 | :robot: | [S] W5.0 | **Comparativo de colaboradores (AC-3.7.11):** adicionar coluna de checkbox na tabela de colaboradores (máx 4); criar `CollaboratorCompareChart` como `LineChart` do Recharts com uma linha por colaborador selecionado usando `monthly[]` já disponível; renderizar acima da tabela quando ≥2 selecionados; cores de `CHART_COLORS` rotacionando: blue, amber, green, red |
| T3.7.W5.3 | :robot: | [S] W5.1 | **Linha de taxa de resposta (AC-3.7.12):** no gráfico de tendência principal, adicionar `Line` de `reply_rate_pct` no eixo Y direito (0-100%); checkbox "Exibir taxa de resposta" no card header, desmarcado por padrão; cor `CHART_COLORS.gray` |
| T3.7.W5.4 | :robot: | [S] W5.2 | Rebuild Docker + screenshot Analytics → validar comparativo de 2 colaboradores sobrepostos, taxa de resposta toggleável |

---

## Wave 6 — Feature: Página de Perfil de Colaborador

> **Critério de saída:** `/collaborators/:id` carrega dados reais, exibe todos os
> blocos definidos em AC-3.7.6 a AC-3.7.10, link funcional a partir de Analytics
> e Dashboard.

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.7.W6.0 | :robot: | [S] W2.6 | **Rota:** adicionar `{ path: '/collaborators/:id', element: <CollaboratorProfilePage /> }` ao router; `React.lazy` + `Suspense`; `RequireAuth` (todos os roles); link no `routes.tsx` |
| T3.7.W6.1 | :robot: | [S] W6.0 | **`CollaboratorProfilePage`** — estrutura geral: breadcrumb "Colaboradores / [Nome]", 4 KPI cards com `DeltaBadge`, card de `RatingHistogram`, `ComposedChart` de evolução mensal, `CollaboratorReviewsTable`; loading skeleton para cada bloco independentemente |
| T3.7.W6.2 | :robot: | [S] W6.1 | **`CollaboratorReviewsTable`**: tabela com colunas Data | Nota (badge colorido) | Trecho da menção (120 chars, italic) | Revisor | Ações. Borda lateral por rating (`ratingBorderClass`). Botão "Ver completa" abre `ReviewDetailDialog` existente (reutilizar) |
| T3.7.W6.3 | :robot: | [S] W6.1 | **Delta badges no perfil (AC-3.7.7):** calcular deltas no frontend a partir de `mentions_last_6m` vs. `mentions_prev_6m` e `avg_rating_last_6m` vs. `avg_rating_prev_6m` do response do endpoint |
| T3.7.W6.4 | :robot: | [P] W6.1 | **Links para o perfil:** na tabela "Colaboradores Mais Mencionados" do Dashboard, tornar o nome clickável (`Link` para `/collaborators/:id`); na tabela de Analytics, tornar o nome clickável |
| T3.7.W6.5 | :robot: | [S] W6.1–W6.4 | Rebuild Docker + login + navegar para perfil de 2 colaboradores diferentes → screenshot de cada bloco → validar dados, deltas, histograma, reviews table |

---

## Wave 7 — Testes

> **Critério de saída:** `pytest` ≥ 15 novos testes verdes; `vitest` ≥ 10 novos
> testes verdes; zero regressões nos testes anteriores.

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.7.W7.0 | :robot: | [S] W1 | **pytest — `get_overview` com `compare_previous=True`:** verificar que `previous_period` tem datas corretas e que delta é calculável; edge case sem data_from/date_to |
| T3.7.W7.1 | :robot: | [P] W7.0 | **pytest — `rating_distribution`:** verificar que soma dos valores == `total_reviews`; edge case 0 reviews |
| T3.7.W7.2 | :robot: | [P] W7.0 | **pytest — `reply_rate_pct`:** entre 0 e 100 para dados reais; 0.0 quando nenhuma tem reply |
| T3.7.W7.3 | :robot: | [P] W7.0 | **pytest — `GET /collaborators/:id/profile`:** 200 com dados completos; 404 para id inexistente; campo `ranking` coerente com total_collaborators |
| T3.7.W7.4 | :robot: | [P] W7.0 | **pytest — `list_reviews` com `collaborator_id`:** todas as reviews retornadas têm pelo menos uma menção ao collaborator; sem overlap quando id não existe |
| T3.7.W7.5 | :robot: | [P] W7.0 | **pytest — `list_reviews` com `sentiment`:** apenas reviews com label.sentiment == valor passado; `sentiment=unknown` retorna reviews sem label ou com sentiment=unknown |
| T3.7.W7.6 | :robot: | [P] W7.0 | **pytest — `GET /metrics/data-status`:** resposta com estrutura correta; `days_since_last_review` >= 0 |
| T3.7.W7.7 | :robot: | [P] | **vitest — `DeltaBadge`:** positivo (verde, seta cima), negativo (vermelho, seta baixo), zero/null (cinza, "Estável"); snapshot test |
| T3.7.W7.8 | :robot: | [P] | **vitest — `RatingHistogram`:** barras proporcionais (se 5★ = 50% dos reviews, sua barra tem width 50%); renderiza 5 barras sempre; total 0 = tudo 0% sem crash |
| T3.7.W7.9 | :robot: | [P] | **vitest — `CollaboratorProfilePage`:** mock `useCollaboratorProfile` com dados; verifica que KPI cards rendem; verifica que ReviewsTable tem N linhas; verifica "Perfil não encontrado" para 404 |
| T3.7.W7.10 | :robot: | [P] | **vitest — URL state Reviews:** `useSearchParams` inicializa filtros a partir da URL; mudar rating atualiza URL param |
| T3.7.W7.11 | :robot: | [P] | **vitest — modo compacto:** toggle muda layout; preferência persiste em localStorage mock |
| T3.7.W7.12 | :robot: | [S] todos | Full regression: `pytest` (todos verdes) + `vitest` (todos verdes) + bundle check (maior chunk < 400KB) |

---

## Wave 8 — Validação visual final

> **Critério de saída:** screenshots validados de todas as páginas com as features
> novas; nenhuma regressão visual detectada.

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.7.W8.0 | :robot: | [S] W7 | Docker rebuild + login via Playwright |
| T3.7.W8.1 | :robot: | [P] | Screenshot Dashboard → validar: 5 KPI cards com delta e histograma, freshness no sidebar, date range picker |
| T3.7.W8.2 | :robot: | [P] | Screenshot Reviews → validar: filtro colaborador (selecionar 1), filtro sentimento, URL atualizada, modo compacto |
| T3.7.W8.3 | :robot: | [P] | Screenshot Analytics → validar: selecionar 2 colaboradores para comparativo, linha de taxa de resposta ativada |
| T3.7.W8.4 | :robot: | [P] | Screenshot `/collaborators/:id` → validar: KPIs com delta, histograma, gráfico mensal, tabela de reviews com snippets |
| T3.7.W8.5 | :robot: | [P] | Screenshot Meu Desempenho → validar: nenhuma regressão |
| T3.7.W8.6 | :standing_person: | [S] W8.1–W8.5 | **GATE:** Senhor revisa screenshots e aprova merge |

---

## Wave 9 — Finalização

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.7.W9.0 | :robot: | [S] W8.6 | CHECKPOINT.md da Fase 3.7 |
| T3.7.W9.1 | :robot: | [S] W9.0 | `mem_save` — session_summary com capacidades entregues, decisões tomadas, estado do produto |
| T3.7.W9.2 | :robot: | [S] W9.0 | Atualizar `SESSION-OPENING-PROMPT.md` da Fase 4 com novo estado pós-3.7 |
| T3.7.W9.3 | :robot: | [S] W9.0 | Merge em `main`, tag `v0.0.5.2-phase-3.7`, push |

---

## Resumo de gates humanos

| Gate | Momento | Ação do Senhor |
|------|---------|----------------|
| T3.7.W8.6 | Após validação visual completa | Aprovar screenshots e merge |

---

## Mapa de dependências entre waves

```
W1 (backend) ──────────────────────────────────────────┐
                                                        ▼
W2 (componentes base) ───────────────────────────────► W3 (Dashboard)
                      │                               ► W4 (Reviews)
                      │                               ► W5 (Analytics)
                      └──────────────────────────────► W6 (Perfil)
                                                        │
W3 + W4 + W5 + W6 ──────────────────────────────────► W7 (Testes)
                                                        │
                                                        ▼
                                                       W8 (Validação)
                                                        │
                                                        ▼
                                                       W9 (Finalização)
```

W3, W4, W5 e W6 são **paralelizáveis** entre si após W1 e W2.

---

## Estimativa de commits

| Wave | Commits |
|------|---------|
| W1 | 1 (backend extensions) |
| W2 | 1 (base components + hooks + types) |
| W3 | 1 (Dashboard) |
| W4 | 1 (Reviews) |
| W5 | 1 (Analytics) |
| W6 | 1 (CollaboratorProfile) |
| W7 | 1 (tests) |
| W8 | 0 (apenas validação) |
| W9 | 1 (CHECKPOINT + tag) |
| **Total** | **~8 commits** |
