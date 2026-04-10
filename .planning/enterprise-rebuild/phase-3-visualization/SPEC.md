# SPEC — Phase 3: Visualization Dashboard Refactor

**Status:** DRAFT (pending approval)
**Author:** JARVIS
**Date:** 2026-04-10
**Depends on:** Phase 1 (Auth & BFF), Phase 2 (Collaborators Admin Panel)
**Branch:** `feat/phase-3-visualization`
**Release:** `v0.0.5-phase-3`

---

## 1. Objetivo

Reconstruir a experiencia de visualizacao do dashboard sobre o BFF FastAPI,
eliminando todo fallback mockado. Entregar paginas de consulta de reviews,
metricas agregadas, graficos de tendencia e performance de colaboradores,
com dados reais do Supabase via TanStack Query. Reduzir o bundle de 779KB
com code-splitting.

---

## 1.1 Diretriz de linguagem e simplicidade

**Toda a interface deve estar em portugues brasileiro simples e claro.**
Simples o suficiente para que ate uma crianca consiga entender o que e,
como funciona e como navegar. Isso se aplica a **todas** as visoes — admin
e usuario comum.

Principios:
- **Labels e botoes:** portugues direto, sem jargao tecnico. "Avaliacoes"
  em vez de "Reviews". "Nota media" em vez de "Average Rating". "Carregar
  mais" em vez de "Load more". "Colaboradores" em vez de "Collaborators".
- **Mensagens de erro:** linguagem humana. "Nao foi possivel carregar os
  dados. Tente novamente." em vez de "HTTP 500 Internal Server Error".
- **Estados vazios:** explicativos e amigaveis. "Nenhuma avaliacao encontrada
  para este periodo." em vez de "No results".
- **Navegacao:** nomes claros no menu. "Painel Geral", "Avaliacoes",
  "Analises", "Administracao > Colaboradores".
- **Tooltips e ajuda:** onde um termo possa gerar duvida, incluir tooltip
  curto explicativo. Ex: "Nota media" → "Media de todas as notas de 1 a 5".
- **Numeros:** formatacao brasileira (1.234 com ponto de milhar, 4,72 com
  virgula decimal).
- **Datas:** formato brasileiro (10/04/2026), nomes de meses por extenso
  nos graficos ("Jan", "Fev", "Mar" etc.).

**Ortografia e gramatica:**
- Todas as strings visiveis ao usuario devem seguir **rigorosamente** as
  regras da lingua portuguesa: acentuacao correta (á, é, í, ó, ú, ã, õ,
  â, ê, ô, ç), concordancia nominal e verbal, coerencia textual.
- Exemplos: "Avaliações" (não "Avaliacoes"), "Análises" (não "Analises"),
  "Painel Geral" (não "Painel geral"), "Não foi possível" (não "Nao foi
  possivel"), "Período" (não "Periodo").
- Nomes proprios de secoes e titulos seguem regra de capitalizacao em PT-BR:
  primeira palavra maiuscula, substantivos proprios maiusculos, restante
  minusculo exceto em titulos de pagina.
- Plurais corretos: "1 avaliação", "2 avaliações"; "1 estrela", "5 estrelas".
- Genero correto: "Nota média" (feminino), "Total de avaliações" (feminino).

Referencia: Constituicao Artigo X — "Portugues na Interface, Ingles no Codigo".
O codigo-fonte permanece em ingles; toda string visivel ao usuario e em
portugues com ortografia e gramatica impecaveis.

---

## 2. Escopo

### 2.1 Backend — Novos endpoints

Todos os endpoints exigem autenticacao (`require_authenticated`). Viewers,
managers e admins podem acessar. Dados retornados via `service_role` (RLS bypass).

| # | Endpoint | Metodo | Descricao |
|---|----------|--------|-----------|
| E1 | `/api/v1/reviews` | GET | Lista paginada cursor-based |
| E2 | `/api/v1/reviews/{review_id}` | GET | Detalhe de um review |
| E3 | `/api/v1/metrics/overview` | GET | KPIs agregados |
| E4 | `/api/v1/metrics/trends` | GET | Serie temporal mensal |
| E5 | `/api/v1/metrics/collaborator-mentions` | GET | Mencoes por colaborador por mes |

#### E1 — `GET /api/v1/reviews`

Query params:
- `cursor` (string, optional) — review_id para cursor-based pagination
- `limit` (int, default 50, max 200)
- `rating` (int, optional, 1-5) — filtro por nota
- `search` (string, optional, max 200) — busca em comment + reviewer_name
- `date_from` / `date_to` (ISO date, optional) — filtro por create_time
- `sort_by` (enum: `create_time` | `rating`, default `create_time`)
- `sort_order` (enum: `asc` | `desc`, default `desc`)

Response:
```json
{
  "items": [ReviewOut],
  "next_cursor": "string | null",
  "has_more": true,
  "total": 5372
}
```

**ReviewOut schema:**
```
review_id, location_id, rating, comment, reviewer_name, is_anonymous,
create_time, update_time, reply_text, reply_time, review_url,
is_local_guide, sentiment (from review_labels, nullable),
is_enotariado (from review_labels, nullable),
collaborator_names (list[str], from review_collaborators JOIN collaborators)
```

Cursor-based: ordena por `(create_time DESC, review_id DESC)`. O cursor
codifica `(create_time, review_id)` do ultimo item. Query usa
`WHERE (create_time, review_id) < (cursor_time, cursor_id)`.

O `total` e calculado uma unica vez (sem cursor) para exibir contagem
no header da pagina. Nao recalcula a cada pagina.

#### E2 — `GET /api/v1/reviews/{review_id}`

Response: `ReviewDetailOut` (ReviewOut + campos extras):
```
+ original_language, translated_text, response_text, response_time,
  reviewer_id, reviewer_url, reviewer_photo_url, collection_source,
  processed_at, mentions (list[MentionOut])
```

**MentionOut schema:**
```
collaborator_id, collaborator_name, mention_snippet, match_score
```

#### E3 — `GET /api/v1/metrics/overview`

Query params:
- `date_from` / `date_to` (ISO date, optional) — periodo do calculo

Response `MetricsOverviewOut`:
```json
{
  "total_reviews": 5372,
  "avg_rating": 4.72,
  "five_star_pct": 85.3,
  "one_star_pct": 2.1,
  "total_with_comment": 3210,
  "total_with_reply": 1580,
  "total_enotariado": 2100,
  "avg_rating_enotariado": 4.85,
  "total_collaborators_active": 13,
  "total_mentions": 2594,
  "period_start": "2024-01-01",
  "period_end": "2026-04-10"
}
```

Calculado com queries diretas (COUNT, AVG, etc.) sobre `reviews` +
`review_labels` + `review_collaborators`. Sem materialized view.

#### E4 — `GET /api/v1/metrics/trends`

Query params:
- `months` (int, default 12, max 60)
- `location_id` (string, optional)

Response `TrendsOut`:
```json
{
  "months": [
    {
      "month": "2026-03-01",
      "total_reviews": 42,
      "avg_rating": 4.65,
      "reviews_enotariado": 18,
      "avg_rating_enotariado": 4.80
    }
  ]
}
```

Consulta `mv_monthly` se disponivel; fallback para `GROUP BY date_trunc`
sobre `reviews` + `review_labels`.

#### E5 — `GET /api/v1/metrics/collaborator-mentions`

Query params:
- `months` (int, default 12, max 60)
- `include_inactive` (bool, default false)

Response `CollaboratorMentionsOut`:
```json
{
  "collaborators": [
    {
      "collaborator_id": 1,
      "full_name": "Maria Silva",
      "is_active": true,
      "total_mentions": 312,
      "avg_rating_mentioned": 4.82,
      "monthly": [
        { "month": "2026-03-01", "mentions": 8, "avg_rating": 4.75 }
      ]
    }
  ]
}
```

JOIN `review_collaborators` + `reviews` + `collaborators`, agrupado por
colaborador e mes.

---

### 2.2 Backend — ORM Models novos

| Model | Tabela | Observacao |
|-------|--------|------------|
| `Review` | `reviews` | Mapeamento read-only (Fase 3 nao escreve reviews) |
| `ReviewLabel` | `review_labels` | JOIN para sentiment/is_enotariado |

Nao criar ORM para `gbp_locations`, `services`, `review_services` nesta
fase — irrelevante para os endpoints propostos.

---

### 2.3 Frontend — Paginas

| # | Rota | Pagina | Acesso |
|---|------|--------|--------|
| P1 | `/dashboard` | Dashboard overview (KPIs + trend chart) | authenticated |
| P2 | `/reviews` | Lista paginada + painel de detalhe | authenticated |
| P3 | `/analytics` | Graficos avancados + performance colaboradores | authenticated |

**Decisao D3.1:** consolidar `/collaborators` (view) e `/trends` como secoes
dentro de `/dashboard` e `/analytics` respectivamente, em vez de paginas
separadas. Menos navegacao, melhor density de informacao. O Senhor pode
ajustar antes da aprovacao.

#### P1 — Painel Geral (`/dashboard`)

Header: **"Painel Geral"**

- 4 KPI cards com labels em portugues:
  - "Total de Avaliacoes" (icone estrela)
  - "Nota Media" (icone grafico) — formatado "4,72" (virgula)
  - "Avaliacoes 5 Estrelas" (icone trofeu) — "85,3%"
  - "Avaliacoes E-notariado" (icone selo) — percentual
- Grafico de linha: "Avaliacoes por Mes" (ultimos 12 meses) via recharts.
  Eixo X com meses abreviados em PT ("Jan", "Fev", "Mar"...).
- Grafico de barras: "Distribuicao de Notas" (1 a 5 estrelas), label
  embaixo "1 estrela", "2 estrelas" etc.
- Tabela "Top 5 Colaboradores" por mencoes (nome, mencoes, nota media).
  Link "Ver todos" leva a /analytics.
- Loading: skeleton cards + skeleton chart
- Empty: "Ainda nao ha avaliacoes registradas."

Esta pagina sera a rota default apos login (substituindo HealthPage).

#### P2 — Avaliacoes (`/reviews`)

Header: **"Avaliacoes"**

- Tabela com colunas: "Nota" (estrelas visuais), "Avaliador", "Comentario"
  (truncado), "Data" (dd/mm/aaaa), "Sentimento" (badge colorido:
  "Positivo"/"Neutro"/"Negativo"/"Sem classificacao")
- Cursor-based pagination (botao "Carregar mais avaliacoes")
- Filtros com labels claros:
  - "Filtrar por nota" (select 1-5 estrelas)
  - "Buscar" (placeholder: "Buscar por comentario ou nome do avaliador...")
  - "Periodo" (data inicio / data fim, formato dd/mm/aaaa)
- Clique em row abre painel lateral com detalhe completo:
  - Avaliacao completa, resposta do cartorio, colaboradores mencionados,
    sentimento, data
- Loading: skeleton table rows
- Empty: "Nenhuma avaliacao encontrada para os filtros selecionados."

#### P3 — Analises (`/analytics`)

Header: **"Analises"**

- Grafico de linha: "Tendencia da Nota Media" (mensal)
- Grafico de barras empilhadas: "Avaliacoes E-notariado vs. Outras" por mes
- Secao "Desempenho dos Colaboradores":
  - Tabela: "Nome", "Total de Mencoes", "Nota Media", mini-grafico de
    tendencia mensal
  - Tooltip na coluna "Mencoes": "Quantas vezes este colaborador foi
    citado nas avaliacoes"
- Filtro: "Periodo" (selector de meses ou date range)
- Loading: skeleton charts + skeleton table
- Empty: "Sem dados suficientes para exibir analises neste periodo."

---

### 2.4 Frontend — Migracao TanStack Query

Substituir todos os `useEffect` + `fetch` por hooks `useQuery` / `useInfiniteQuery`:

- CollaboratorsPage: migrar para `useQuery` (refetch on focus, stale time 30s)
- Dashboard/Reviews/Analytics: novos hooks com TanStack Query desde o inicio

Padrao de hooks: `frontend/src/hooks/use-*.ts`
- `useMetricsOverview(params)` → `useQuery`
- `useMetricsTrends(params)` → `useQuery`
- `useCollaboratorMentions(params)` → `useQuery`
- `useReviews(params)` → `useInfiniteQuery` (cursor-based)
- `useReviewDetail(reviewId)` → `useQuery`

---

### 2.5 Frontend — Code-Splitting

Reduzir o chunk de 779KB via:
- `React.lazy()` + `Suspense` para todas as rotas
- Dynamic import de recharts (charting so carrega nas paginas de graficos)
- Manter vendor chunk separado (react, react-dom)

Meta: maior chunk < 400KB gzipped.

---

### 2.6 Frontend — Error Handling

- Error boundary global para crashes inesperados
- `onError` callbacks nos hooks TanStack Query → toast via Sonner
- Nenhum dado mockado. Se API falha, exibir mensagem de erro clara.
- 401 → redirect para /login (ja implementado no axios interceptor)
- 403 → toast "Acesso negado"
- 500 → toast "Erro interno, tente novamente"

---

## 3. Acceptance Criteria

### AC-3.1 — Lista de avaliacoes paginada
**Given** usuario autenticado em `/reviews`
**When** a pagina carrega
**Then** exibe ate 50 avaliacoes ordenadas por data decrescente, com botao
"Carregar mais avaliacoes" que busca a proxima pagina via cursor.

### AC-3.2 — Detalhe da avaliacao
**Given** usuario autenticado visualizando lista de avaliacoes
**When** clica em uma avaliacao
**Then** exibe todos os campos incluindo resposta do cartorio, colaboradores
mencionados e sentimento. Todos os textos em portugues.

### AC-3.3 — Filtros de avaliacoes
**Given** usuario em `/reviews`
**When** seleciona nota=5 e busca "excelente"
**Then** a lista mostra apenas avaliacoes com nota 5 contendo "excelente"
no comentario ou nome do avaliador.

### AC-3.4 — KPIs do Painel Geral
**Given** usuario autenticado em `/dashboard`
**When** a pagina carrega
**Then** exibe 4 cards com dados reais: "Total de Avaliacoes", "Nota Media"
(formatado com virgula: 4,72), "Avaliacoes 5 Estrelas" (%), "Avaliacoes
E-notariado" (%). Nenhum valor mockado. Todos os labels em portugues.

### AC-3.5 — Grafico de tendencia
**Given** usuario em `/dashboard`
**When** dados de tendencia carregam
**Then** exibe grafico de linha "Avaliacoes por Mes" dos ultimos 12 meses.
Eixo X = meses abreviados em PT ("Jan", "Fev"...), eixo Y = contagem.

### AC-3.6 — Distribuicao de notas
**Given** usuario em `/dashboard`
**When** a pagina carrega
**Then** exibe grafico de barras "Distribuicao de Notas" (1 a 5 estrelas),
labels "1 estrela", "2 estrelas" etc., contagem e percentual.

### AC-3.7 — Desempenho dos colaboradores
**Given** usuario em `/analytics`
**When** a pagina carrega
**Then** exibe tabela "Desempenho dos Colaboradores" com colunas "Nome",
"Total de Mencoes", "Nota Media", tendencia mensal. Tooltip em "Mencoes"
explica o significado.

### AC-3.8 — Tratamento de erros (sem mocks)
**Given** backend retorna HTTP 500 em qualquer endpoint
**When** o frontend tenta carregar os dados
**Then** exibe toast "Nao foi possivel carregar os dados. Tente novamente."
e mensagem no lugar do grafico/tabela. Nenhum dado ficticio.

### AC-3.9 — Estados de carregamento
**Given** usuario navega para qualquer pagina
**When** os dados ainda estao sendo carregados
**Then** exibe skeleton placeholders (cards, linhas de tabela, area de grafico).

### AC-3.10 — Estados vazios
**Given** filtros retornam zero resultados
**When** a resposta chega
**Then** exibe mensagem amigavel em portugues ("Nenhuma avaliacao encontrada
para este periodo.") em vez de tela vazia.

### AC-3.11 — Code-splitting efetivo
**Given** build de producao do frontend
**When** analisamos o bundle
**Then** o maior chunk e < 400KB (pre-gzip). Rotas sao lazy-loaded.
recharts nao carrega na rota /login.

### AC-3.12 — Migracao TanStack Query
**Given** CollaboratorsPage existente
**When** refatorada
**Then** usa `useQuery` com staleTime, refetch on window focus, e error
handling via onError. Zero `useEffect` + `fetch` manual para data fetching.

### AC-3.13 — Rota default
**Given** usuario autenticado acessa `/`
**When** a rota resolve
**Then** redireciona para `/dashboard` (nao mais HealthPage).

### AC-3.14 — Acesso do viewer
**Given** usuario com role `viewer`
**When** acessa `/dashboard`, `/reviews`, `/analytics`
**Then** todas as paginas carregam normalmente com dados. Viewer pode ler
tudo, nao pode acessar `/admin/collaborators`.

### AC-3.15 — Consistencia da paginacao cursor
**Given** 5372 avaliacoes no banco
**When** usuario pagina ate o fim (50 por vez)
**Then** nenhuma avaliacao e duplicada ou pulada entre paginas.

### AC-3.16 — Navegacao
**Given** usuario autenticado em qualquer pagina protegida
**When** visualiza a interface
**Then** existe sidebar com links em portugues: "Painel Geral", "Avaliacoes",
"Analises", e (se admin/manager) "Administracao > Colaboradores".

### AC-3.17 — Interface integralmente em portugues
**Given** qualquer pagina da aplicacao (admin ou usuario)
**When** renderiza
**Then** todos os textos visiveis — labels, botoes, tooltips, mensagens de
erro, estados vazios, cabecalhos de tabela, legendas de graficos, nomes de
meses — estao em portugues brasileiro simples. Numeros usam formato BR
(ponto milhar, virgula decimal). Datas em dd/mm/aaaa.

---

## 4. Invariantes

- I-3.1: Frontend **nunca** exibe dado mockado ou fallback silencioso. Erro = erro visivel.
- I-3.2: Todos os endpoints exigem cookie de sessao valido (401 sem cookie).
- I-3.3: `service_role` usado apenas no backend. Frontend nao conhece.
- I-3.4: Nenhuma migration nova modifica tabelas existentes.
- I-3.5: Cursor-based pagination e deterministica (sem race condition com inserts).
- I-3.6: recharts carregado apenas via dynamic import nas paginas que usam graficos.

---

## 5. Limites e exclusoes

- Nao implementa escrita de reviews (coleta e Fase 4).
- Nao implementa NLP/classificacao (Fase 4).
- Nao implementa refresh de `mv_monthly` — usa dados existentes ou fallback SQL.
- Nao modifica schema existente — apenas leitura.
- Nao implementa filtro por location_id na UI (single-tenant, mas Artigo IX preserva o campo).
- Nao implementa export de reviews (pode ser adicionado como enhancement futuro).

---

## 6. Riscos

| # | Risco | Mitigacao |
|---|-------|-----------|
| R1 | `mv_monthly` pode nao ter dados atualizados | Fallback para query direta com GROUP BY |
| R2 | Chunk de recharts pode ser grande (~200KB) | Dynamic import + tree-shaking |
| R3 | 5372 reviews cabe em uma query, mas pode crescer | Cursor pagination ja implementada |
| R4 | review_labels pode ter nulls (NLP nao rodou) | Tratar sentiment null como "unknown" no frontend |
| R5 | shadcn v4 base-ui API differences | Reutilizar patterns da Fase 2 (D2.6) |

---

## 7. Decisoes tecnicas

| ID | Decisao | Justificativa |
|---|---------|---------------|
| D3.1 | 3 paginas (dashboard, reviews, analytics) em vez de 5 | Densidade de informacao, menos navegacao |
| D3.2 | Cursor-based via (create_time, review_id) DESC | Deterministic, no skipped rows on insert |
| D3.3 | ORM read-only para reviews (sem create/update) | Fase 3 e somente leitura |
| D3.4 | recharts como lib de graficos | React-friendly, boa integracao Tailwind, popular |
| D3.5 | React.lazy para code-splitting | Built-in, sem dep adicional |
| D3.6 | Sidebar layout com navigation | Padrao dashboard, extensivel para Fases 4-5 |
| D3.7 | `require_authenticated` (nao `require_role`) nos endpoints | Todos os roles podem visualizar dados |
| D3.8 | Total count via COUNT separado (nao em cada cursor page) | Performance: count so na primeira requisicao |
| D3.9 | Interface 100% portugues BR simples | Diretriz do Senhor: ate uma crianca deve entender. Numeros BR (virgula), datas dd/mm/aaaa, meses em PT. Aplica-se a admin e user views |
