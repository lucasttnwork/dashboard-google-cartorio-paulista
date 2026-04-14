# SPEC — Phase 3.8: QA Remediation + Time Window Cascading + Daily Granularity

> **Status:** APROVADO — 2026-04-14 (comando direto do Senhor via `/autonomous-harness`)
> **Fase anterior:** Phase 3.7 (tag `v0.0.5.2-phase-3.7` em `main`, ainda não pushed)
> **Tag desta fase:** `v0.0.5.3-phase-3.8`
> **Branch mãe de workers:** worktrees a partir de `main`

---

## Missão

Fechar os achados do QA independente da Fase 3.7 (1 MAJOR, 2 MINOR, 3 UX, 5 A11Y) e eliminar a limitação temporal dos dados agregados: toda métrica exibida no Dashboard e em Analytics deve respeitar o seletor de período ativo (preset ou custom range), incluindo o comparativo de colaboradores. Adicionar granularidade diária quando o intervalo selecionado for curto (≤ 60 dias), trocando automaticamente a série mensal por uma série diária no gráfico de tendência principal.

---

## Capacidades entregues (11 findings + 2 features)

### Bug fixes

| ID | Severidade | Descrição |
|----|------------|-----------|
| F1 | MAJOR | Corrigir interceptação de pointer events nas setas ◀ ▶ do DateRangePicker (botões de navegação de mês) |
| F2 | MINOR | Expor itens do dropdown "Todos os colaboradores" em Reviews via ARIA (`role="option"` ou equivalente acessível) |
| F3 | MINOR | Impor limite de 3 colaboradores também na leitura da URL — se URL tem `collaborator_id=1&2&3&4`, descartar o 4º tanto na UI quanto na chamada API |
| F4 | UX | DateRangePicker mantém o calendário aberto até o usuário selecionar AMBOS endpoints do range (atualmente fecha no primeiro clique) |
| F5 | UX | `DeltaBadge` exibe "N/D" (ou "Sem baseline") quando `previous_period.total_reviews === 0` — não mostrar "+5372" contra um período anterior vazio |
| F6 | UX | URL param `?sentiment=positive` aceito como alias de `?sentiment=pos` (e idem para `neutral`/`negative`/`unknown`). Opcional: redirecionar `positive` → `pos` para canonicalizar |
| A1 | A11Y minor | Remover H1 duplicado — manter apenas um `<h1>` por página (`<h1>` do roteador, não do título do app na sidebar) |
| A2 | A11Y minor | Adicionar skip link ("Pular para conteúdo principal") em `AppLayout` |
| A3 | A11Y cosmetic | `ReviewDetailDialog` botão de fechar: `aria-label="Fechar detalhes da avaliação"` em PT-BR (não "Close") |
| A4 | A11Y minor | Inputs ocultos do seletor de período recebem `aria-label` descritivo |
| A5 | A11Y minor | Itens do dropdown de colaboradores em Reviews ficam anunciáveis (cobre F2) |

### Features novas

| ID | Descrição |
|----|-----------|
| C1 | `/api/v1/metrics/trends` aceita `date_from`/`date_to` (além de `months`) para filtrar o range absoluto |
| C2 | `/api/v1/metrics/trends` aceita `granularity: "month" \| "day"` (default `month`). Quando `day`, agrupa por `date_trunc('day', create_time)` e retorna lista de `DayData` com campo `day` ISO ao invés de `month` |
| C3 | `/api/v1/metrics/collaborator-mentions` aceita `date_from`/`date_to` (além de `months`), aplicando o filtro temporal a TODAS as agregações (total_mentions, avg_rating, monthly) |
| C4 | Dashboard: quando modo custom está ativo, passa `date_from`/`date_to` para `useTrends` e `useCollaboratorMentions` — a tabela "Top Mencionados" respeita o intervalo custom |
| C5 | Analytics: idem C4 — tabela de colaboradores, gráfico comparativo e gráfico de tendência todos respeitam o range custom |
| C6 | Dashboard + Analytics: quando o range selecionado for ≤ 60 dias (preset "últimos 3 meses" ou custom curto), o gráfico de tendência automaticamente usa `granularity=day` em vez de `month` |
| T1 | Testes pytest novos cobrindo `date_from`/`date_to` + `granularity=day` em `/trends` e `/collaborator-mentions` |
| T2 | Testes vitest cobrindo o comportamento cascading nos hooks + fix visual do Calendar |

---

## Acceptance Criteria (resumo — detalhe por task em TASKS.md)

- **AC-3.8.1** DateRangePicker permite clicar nas setas ◀ ▶ sem JS assistivo
- **AC-3.8.2** Accessibility tree expõe itens do dropdown de colaboradores em Reviews
- **AC-3.8.3** `/reviews?collaborator_id=1&2&3&4` resulta em 3 chips E 3 IDs enviados à API (o 4º é descartado)
- **AC-3.8.4** DateRangePicker não fecha após o primeiro clique — usuário completa o range com o 2º clique
- **AC-3.8.5** `DeltaBadge` mostra "—" / "Estável" quando `previous_period.total_reviews === 0`
- **AC-3.8.6** `/reviews?sentiment=positive` funciona equivalente a `?sentiment=pos`
- **AC-3.8.7** Cada página tem exatamente um `<h1>`. Skip link presente em `AppLayout`
- **AC-3.8.8** `ReviewDetailDialog` close tem `aria-label` PT-BR
- **AC-3.8.9** Selecionar "Últimos 3 meses" no Dashboard → tabela "Top Mencionados" mostra colaboradores com contagens APENAS dos últimos 3 meses (não do histórico inteiro)
- **AC-3.8.10** Selecionar "Últimos 3 meses" no Dashboard → gráfico de tendência exibe granularidade DIÁRIA (uma coluna por dia do período)
- **AC-3.8.11** Selecionar range custom 01 fev a 28 fev no Dashboard → gráfico exibe 28 colunas (dias)
- **AC-3.8.12** Selecionar "Últimos 12 meses" → gráfico mantém granularidade mensal (12 colunas)
- **AC-3.8.13** Analytics idem: comparativo de colaboradores respeita janela, eixo X do comparativo segue a granularidade escolhida
- **AC-3.8.14** `/api/v1/metrics/trends?granularity=day&date_from=2026-01-01&date_to=2026-01-31` retorna `{ months: [...] }` contendo 31 entradas, cada uma com campo `day` ou `month` (shape decidido pelo backend — ver §API contracts)
- **AC-3.8.15** ≥ 8 novos testes pytest + ≥ 6 novos testes vitest cobrindo o comportamento novo, zero regressão

---

## API Contracts

### 3.8.A — `GET /api/v1/metrics/trends` (estendido)

**Query params novos:**
- `date_from: str | None` — ISO date (YYYY-MM-DD)
- `date_to: str | None` — ISO date (YYYY-MM-DD)
- `granularity: "month" | "day" = "month"`

**Semântica:**
- Se `date_from` e/ou `date_to` presentes, **sobrepõem** `months` (que passa a ser ignorado)
- Se nenhum dos dois, comportamento atual: janela relativa `months`
- Quando `granularity="day"`, o SQL agrupa por `date_trunc('day', create_time)` e o schema response troca o campo `month` por `day` (ISO datetime do início do dia)

**Response shape — manter `TrendsOut` mas adicionar campo opcional `granularity`:**
```python
class MonthData(BaseModel):
    month: str | None = None   # ISO mês — presente quando granularity=month
    day: str | None = None     # ISO dia  — presente quando granularity=day
    total_reviews: int
    avg_rating: float
    reviews_enotariado: int
    avg_rating_enotariado: float | None = None
    reply_rate_pct: float

class TrendsOut(BaseModel):
    months: list[MonthData]
    granularity: str = "month"  # echo do param para o frontend decidir como renderizar
```

Nota: o frontend lê `granularity` do response para escolher qual campo (`month` ou `day`) usar como eixo X. Manter o nome da lista como `months` por compatibilidade — renomear seria breaking change. Evoluir para `buckets` é uma futura refactor.

### 3.8.B — `GET /api/v1/metrics/collaborator-mentions` (estendido)

**Query params novos:**
- `date_from: str | None`
- `date_to: str | None`

**Semântica:**
- Quando presentes, sobrepõem `months`
- Aplicam ao filtro SQL `reviews.create_time BETWEEN dt_from AND dt_to`
- As listas `monthly[]` por colaborador também ficam confinadas ao range (ex: request custom 60 dias → cada colaborador retorna no máximo 2 entradas mensais)

Nenhuma mudança no response schema.

---

## Componentes Frontend afetados

| Arquivo | Mudança |
|---|---|
| `frontend/src/components/ui/calendar.tsx` | F1 — CSS fix do pointer-events no caption |
| `frontend/src/components/ui/DateRangePicker.tsx` | F4 — manter calendar aberto até range completo |
| `frontend/src/components/reviews/CollaboratorMultiSelect.tsx` | F2 + F3 — ARIA roles, cap em 3 também no parse de URL |
| `frontend/src/components/layout/AppLayout.tsx` | A1, A2, A4 — skip link, H1 fix, aria-labels |
| `frontend/src/components/reviews/ReviewDetailDialog.tsx` (ou onde estiver) | A3 — aria-label PT-BR no close |
| `frontend/src/pages/DashboardPage.tsx` | F5 (DeltaBadge N/D), C4, C6 |
| `frontend/src/pages/AnalyticsPage.tsx` | C5, C6 |
| `frontend/src/hooks/use-metrics.ts` | C1, C2, C3 — hooks aceitam date_from/date_to/granularity |
| `frontend/src/lib/api/metrics.ts` | C1, C2, C3 — fetcher atualizado |
| `frontend/src/types/metrics.ts` | Campo `day?: string` e `granularity?: string` em `MonthData`/`TrendsOut` |

---

## Out of scope nesta fase

- Extensão do `/metrics/overview` com granularidade diária (fora do mínimo necessário)
- Melhorias de performance do backend (agrupamento por dia é naturalmente mais pesado que mensal — aceitável enquanto o DB é Postgres local)
- Correção dos 21 testes SQLite pré-existentes (Phase 3.5 debt)
- Mudança de nome do campo `months` → `buckets` na response de trends (breaking change, adiar)
- Mudança de visual do DateRangePicker além do minimum-fix — o componente de base react-day-picker fica

---

## Infraestrutura dev-only (não commit)

- `supabase/config.toml` com `[api]` + `[auth]` enabled localmente
- `docker-compose.local.yml` gitignored com `extra_hosts`
- `backend/.env.local` apontando para host.docker.internal + `SUPABASE_JWT_ISSUER=http://127.0.0.1:54321/auth/v1`
- Stack local já de pé (backend, frontend, workers, redis, supabase_*)
