# SPEC — Phase 3.7: Enterprise Data Depth & Interactivity

> **Status:** APROVADO — 2026-04-13
> **Fase anterior:** Phase 3.5 (tag `v0.0.5.1-phase-3.5`)
> **Tag desta fase:** `v0.0.5.2-phase-3.7`
> **Branch:** `feat/phase-3.7-enterprise-depth`
> **Design Discussion aprovado:** `DESIGN-DISCUSSION.md`

---

## Missão

Elevar o dashboard de "protótipo funcional" para produto enterprise-grade:
todos os KPIs com referência temporal, perfil individual de colaborador para
gestores, comparação gráfica entre colaboradores, distribuição de ratings,
filtros cruzados e URLs com estado preservado.

---

## Capacidades entregues (9)

| ID | Capacidade | Onde |
|----|---|---|
| C1 | Delta temporal em todos os KPIs | Dashboard + Perfil |
| C2 | Perfil completo de colaborador (`/collaborators/:id`) | Nova rota |
| C3 | Comparativo gráfico entre colaboradores (overlay) | Analytics |
| C4 | Histograma de distribuição de ratings | Dashboard + Perfil |
| C5 | Filtro de reviews por colaborador (multi-select) | Reviews |
| C6 | URLs com estado de filtros (deep links) | Reviews + Analytics |
| C7 | Taxa de resposta como KPI + linha de tendência | Dashboard + Analytics |
| C8 | Filtro por sentimento + modo compacto/expandido | Reviews |
| C9 | Data freshness indicator + date range picker customizado | Global + Dashboard/Analytics |

---

## Acceptance Criteria

### AC-3.7.1 — Delta temporal no Dashboard (C1)
Cada KPI card do Dashboard exibe um badge de delta com seta:
`↑ +0.15 vs. período anterior` (verde) ou `↓ −0.3 vs. período anterior` (vermelho).
O período de comparação é igual em duração ao selecionado (se filtro = 6 meses,
compara com os 6 meses imediatamente anteriores). Delta `±0` exibe `→ Sem alteração`.
Requisito: mesmo KPI card, mesma linha, sem hover obrigatório.

### AC-3.7.2 — Rating distribution no Dashboard (C4)
Abaixo da nota média (KPI card), exibir mini-histograma horizontal com 5 barras
(1★ a 5★), cada uma proporcional ao percentual real. Tooltip ao hover mostra
`N avaliações (X%)` por estrela. Sem nova biblioteca — CSS `width: X%` puro.

### AC-3.7.3 — Taxa de resposta no Dashboard (C7)
5º KPI card "Taxa de Resposta" exibe `total_with_reply / total_reviews × 100`
com delta vs. período anterior (mesmo padrão de AC-3.7.1).

### AC-3.7.4 — Data freshness indicator (C9a)
Elemento persistente visível em todas as telas autenticadas (sidebar ou header)
exibe: `Dados de [data da review mais recente]` em cinza discreto. Se a data for
> 30 dias no passado, exibe em amber. Se > 90 dias, em vermelho. Tooltip:
`Última sincronização: [data do último collection_run bem-sucedido ou "Nunca"]`.

### AC-3.7.5 — Date range picker customizado (C9b)
O seletor de período no Dashboard e em Analytics mantém as opções existentes
(3/6/12 meses / Todo o período) e adiciona opção "Período personalizado" que
abre um Calendar de faixa (date-range). Selecionado um intervalo customizado,
os dados carregam com `date_from` e `date_to` exatos. O intervalo customizado
ativo exibe label compacto: `15 jan – 31 mar 2025`.

### AC-3.7.6 — Perfil de colaborador: rota pública para todos os roles (C2)
`GET /collaborators/:id` acessível a `admin`, `manager` e `viewer`.
A partir da tabela em Analytics e da tabela "Top Mencionados" no Dashboard,
clicar no nome do colaborador navega para esta rota.
Se o id não existir ou o colaborador estiver inativo e o role for viewer,
retorna 404 com mensagem clara.

### AC-3.7.7 — Perfil de colaborador: KPIs individuais com delta (C2 + C1)
Página `/collaborators/:id` exibe:
- Nome (Title Case), departamento, cargo, status (ativo/inativo)
- Total de menções (com delta MoM: vs. 6 meses anteriores)
- Nota média (com delta vs. 6 meses anteriores)
- Ranking `#X de Y colaboradores ativos` (sem delta)
- Taxa de crescimento das menções no último mês vs. média histórica

### AC-3.7.8 — Perfil de colaborador: distribuição de ratings (C2 + C4)
Card "Distribuição de notas" com histograma idêntico ao AC-3.7.2,
mas calculado apenas sobre reviews que mencionam este colaborador.

### AC-3.7.9 — Perfil de colaborador: evolução mensal (C2)
Gráfico `ComposedChart` idêntico ao de "Meu Desempenho" (menções/mês em barras
+ nota média em linha), para os últimos 12 meses. Se não houver dados mensais,
placeholder "Sem dados suficientes para exibir evolução."

### AC-3.7.10 — Perfil de colaborador: avaliações que o mencionam (C2 + C5)
Tabela (não card) com scroll, exibindo as últimas 20 reviews que mencionam
este colaborador. Colunas: Data | Nota | Trecho da menção (mention_snippet,
até 120 chars) | Revisor | Ações (botão "Ver completa" → ReviewDetailDialog).
Borda lateral colorida por nota (mesmo padrão das outras páginas).

### AC-3.7.11 — Comparativo de colaboradores em Analytics (C3)
Tabela de colaboradores em Analytics ganha coluna de checkbox (multi-select,
máximo 4 simultâneos). Ao selecionar ≥2, o gráfico de tendência acima exibe
uma linha por colaborador selecionado (menções/mês), com cor única de
`CHART_COLORS` e legenda. A linha de "todos" desaparece quando ≥1 selecionado.
Deselecionar todos restaura a visão padrão.

### AC-3.7.12 — Linha de taxa de resposta em Analytics (C7)
Gráfico de tendência em Analytics adiciona linha "Taxa de Resposta (%)" no eixo
Y direito (0–100%), cor cinza `CHART_COLORS.gray`. Checkbox "Exibir taxa de
resposta" no topo do card, desmarcado por padrão.

### AC-3.7.13 — Filtro de reviews por colaborador (C5)
Reviews page adiciona Select "Colaborador" com lista dos colaboradores ativos
(inclui opção "Todos"). Multi-select: até 3 colaboradores simultaneamente via
chips selecionáveis. Backend: `GET /api/v1/reviews?collaborator_id=5,6,7`.
O filtro participa do estado de URL (AC-3.7.15).

### AC-3.7.14 — Filtro de reviews por sentimento (C8)
Reviews page adiciona Select "Sentimento" com opções: Todos / Positivo / Neutro
/ Negativo / Não classificado. Backend: `GET /api/v1/reviews?sentiment=pos`.
O filtro participa do estado de URL (AC-3.7.15).

### AC-3.7.15 — URLs com estado de filtros em Reviews (C6)
Todos os filtros ativos na Reviews page são refletidos como query params na URL:
`/reviews?rating=1&sentiment=neg&collaborator_id=5&sort=create_time:asc&search=atencioso`
Recarregar a página restaura os filtros. Copiar/colar a URL em outra aba
reproduz exatamente o mesmo estado de busca.

### AC-3.7.16 — URLs com estado de filtros em Analytics (C6)
O seletor de período e os colaboradores selecionados no comparativo (C3) são
refletidos na URL:
`/analytics?months=6&compare=3,5,7`
Recarregar a página restaura o estado.

### AC-3.7.17 — Modo compacto/expandido na Reviews page (C8)
Toggle (ícone lista vs. cards) no topo da Reviews page. Modo compacto: linha
densa por review com nota em badge, data, revisor, primeiros 60 chars de
comentário. Modo expandido: card atual. Preferência persiste em `localStorage`.

### AC-3.7.18 — Testes backend: ≥ 15 novos testes pytest
Cobrir obrigatoriamente:
- `get_overview` com `compare_previous=True` retorna deltas corretos
- `rating_distribution` soma para `total_reviews`
- `reply_rate_pct` está entre 0 e 100
- Endpoint `GET /collaborators/:id/profile` retorna 200 para id válido e 404 para inválido
- `list_reviews` com `collaborator_id` filtra corretamente
- `list_reviews` com `sentiment` filtra corretamente
- `GET /metrics/data-status` retorna estrutura correta

### AC-3.7.19 — Testes frontend: ≥ 10 novos testes vitest
Cobrir obrigatoriamente:
- `DeltaBadge` renderiza corretamente para positivo, negativo, zero e undefined
- Rating distribution histogram: barras proporcionais ao input
- `CollaboratorProfilePage` com dados mockados renderiza todas as seções
- Reviews page: `useSearchParams` sincroniza com filtros
- Modo compacto: persiste em localStorage

---

## API Contracts — Novos endpoints e modificações

### 3.7.A — `GET /api/v1/metrics/overview` (modificado)

**Novos query params:**
- `compare_previous: bool = False` — se true, calcula período anterior de mesma duração

**Novos campos no response `MetricsOverviewOut`:**
```python
reply_rate_pct: float               # total_with_reply / total * 100
rating_distribution: dict[str, int] # {"1": n, "2": n, "3": n, "4": n, "5": n}
previous_period: PreviousPeriodOut | None  # presente se compare_previous=True
```

**`PreviousPeriodOut`:**
```python
class PreviousPeriodOut(BaseModel):
    total_reviews: int
    avg_rating: float
    five_star_pct: float
    one_star_pct: float
    reply_rate_pct: float
    total_mentions: int
    period_start: str
    period_end: str
```

---

### 3.7.B — `GET /api/v1/metrics/trends` (modificado)

**Novos campos em `MonthData`:**
```python
reply_rate_pct: float   # total_with_reply / total * 100 para aquele mês
```

---

### 3.7.C — `GET /api/v1/metrics/data-status` (novo)

**Response:**
```python
class DataStatusOut(BaseModel):
    last_review_date: str | None       # ISO datetime da review mais recente
    last_collection_run: str | None    # ISO datetime do último collection_run completado
    total_reviews: int
    days_since_last_review: int | None # calculado no backend
```

**Cache:** `stale-while-revalidate`, 5 min.

---

### 3.7.D — `GET /api/v1/collaborators/{id}/profile` (novo)

**Auth:** `require_authenticated` (todos os roles)
**404:** se `id` não existe

**Response `CollaboratorProfileOut`:**
```python
class CollaboratorProfileOut(BaseModel):
    # Dados básicos
    id: int
    full_name: str
    aliases: list[str]
    department: str | None
    position: str | None
    is_active: bool

    # KPIs agregados (total histórico)
    total_mentions: int
    avg_rating: float | None
    ranking: int | None               # posição entre colaboradores ativos por menções
    total_collaborators_active: int

    # KPIs com delta (vs. 6 meses anteriores)
    mentions_last_6m: int
    mentions_prev_6m: int             # para cálculo de delta no frontend
    avg_rating_last_6m: float | None
    avg_rating_prev_6m: float | None  # para cálculo de delta no frontend

    # Distribuição
    rating_distribution: dict[str, int]  # {"1": n, ..., "5": n}

    # Série temporal (últimos 12 meses)
    monthly: list[CollaboratorMonthData]

    # Reviews recentes (últimas 20)
    recent_reviews: list[CollaboratorReviewOut]
```

**`CollaboratorReviewOut`:**
```python
class CollaboratorReviewOut(BaseModel):
    review_id: str
    rating: int | None
    comment: str | None        # truncado a 300 chars
    reviewer_name: str
    create_time: str | None
    mention_snippet: str | None  # trecho direto do mention
    match_score: float | None
```

---

### 3.7.E — `GET /api/v1/reviews` (modificado)

**Novos query params:**
- `collaborator_id: list[int] | None` — filtra reviews que mencionam ≥1 dos ids
- `sentiment: str | None` — `pos | neu | neg | unknown`

**Mudança de JOIN:** quando `collaborator_id` presente, adiciona:
```sql
INNER JOIN review_collaborators rc ON rc.review_id = r.review_id
WHERE rc.collaborator_id = ANY(:collab_ids)
```

---

## Migrations

**Nenhuma migration de schema necessária.** Todos os dados já existem nas tabelas
presentes. As mudanças são exclusivamente em queries e schemas Pydantic.

---

## Componentes Frontend novos

| Componente | Arquivo | Descrição |
|---|---|---|
| `DeltaBadge` | `src/components/ui/DeltaBadge.tsx` | Badge com seta + valor colorido |
| `RatingHistogram` | `src/components/charts/RatingHistogram.tsx` | 5 barras CSS proporcionais |
| `DataFreshnessIndicator` | `src/components/layout/DataFreshnessIndicator.tsx` | Widget de freshness no sidebar |
| `DateRangePicker` | `src/components/ui/DateRangePicker.tsx` | Calendar com range selection |
| `CollaboratorProfilePage` | `src/pages/CollaboratorProfilePage.tsx` | Página completa de perfil |
| `CollaboratorReviewsTable` | `src/components/collaborators/CollaboratorReviewsTable.tsx` | Tabela de reviews com snippet |
| `CollaboratorCompareChart` | `src/components/charts/CollaboratorCompareChart.tsx` | Overlay de linhas por colab |

---

## Hooks Frontend novos / modificados

| Hook | Modificação |
|---|---|
| `useMetricsOverview(params)` | Adiciona `compare_previous?: boolean` |
| `useTrends(params)` | Response passa a incluir `reply_rate_pct` por mês |
| `useReviews(params)` | Adiciona `collaborator_id?: number[]` e `sentiment?: string` |
| `useCollaboratorProfile(id)` | Novo — busca `GET /api/v1/collaborators/:id/profile` |
| `useDataStatus()` | Novo — busca `GET /api/v1/metrics/data-status`, staleTime 5min |

---

## Out of scope nesta fase

- Keyword cloud / análise textual de menções (Phase 4+)
- Notificações push / alertas de queda de nota (Phase 4+)
- Export PDF / relatório imprimível (Phase 5)
- Reviewer profiling / top reviewers (Phase 5 — LGPD)
- WebSockets / real-time updates (nunca — escala não justifica)

---

## Dependências

- **Nenhuma dependência de Phase 4** — dados históricos (5.372 reviews) são
  suficientes para demonstrar todas as capacidades.
- **Supabase:** zero mudanças de schema. Usa tabelas e índices existentes.
- **shadcn/ui Calendar:** já presente como primitivo Radix no bundle. Necessário
  adicionar o componente `calendar.tsx` da coleção shadcn se ainda não existe.
- **`@tanstack/react-table`:** já em uso na CollaboratorsPage.
