# Design Discussion — Phase 3.7: Enterprise Data Depth & Interactivity

> **Protocolo SDD:** O Senhor revisa este documento antes da SPEC.
> Aprovar = prosseguir para SPEC.md + TASKS.md.
> Reprovar = ajustar aqui, depois seguir.
>
> **Status:** APROVADO — 2026-04-13
> **Data:** 2026-04-13

---

## 1. Diagnóstico Crítico — O que temos hoje não é enterprise-grade

O dashboard atual entrega infraestrutura sólida, mas falha na missão central:
**permitir que gestores e colaboradores tomem decisões baseadas em dados sobre o desempenho da equipe do E-notariado.**

### 1.1 Os cinco buracos que invalidam o produto hoje

**Buraco #1 — Não há resposta para "estamos melhorando?"**
Todos os KPIs são números absolutos sem referência temporal. A nota média é 4.2 —
mas era 4.5 no período anterior? Era 3.9? Um gestor que vê "4.2" não sabe se
deve celebrar ou agir. Nenhum delta, nenhuma seta, nenhuma comparação existe.

**Buraco #2 — Não existe página de colaborador individual para gestores**
A página "Meu Desempenho" só o próprio colaborador vê de si. O gestor que quer
entender o desempenho de João Silva — todas as reviews que o citaram, a evolução
dele mês a mês, o contexto exato das menções — não tem para onde ir.
Tem que buscar "João" na página de Reviews manualmente, sem agregação nenhuma.
Isso destrói qualquer valor de gestão de equipe.

**Buraco #3 — Comparação entre colaboradores é estática e unidimensional**
A tabela de Analytics mostra menções + nota. Só isso. Não é possível selecionar
dois colaboradores e ver as curvas deles lado a lado. Não é possível ver quem
melhorou mais no último trimestre. A tabela é um retrato, não uma análise.

**Buraco #4 — A nota média esconde a distribuição real**
Um 4.2 formado por 80% de 5-star e 15% de 1-star é radicalmente diferente de
um 4.2 formado por 80% de 4-star. O primeiro sinaliza polarização e potencial
de crise; o segundo sinaliza consistência saudável. O dashboard mostra a mesma
coisa para ambos. Nenhuma distribuição de rating existe em lugar nenhum.

**Buraco #5 — Dados não são pesquisáveis de forma cruzada**
Não é possível pedir: "mostre-me as reviews de 1-2 estrelas dos últimos 3 meses
que mencionam colaboradores e não foram respondidas." Cada filtro existe em
silo. Filtrar por colaborador na página de Reviews não existe. Filtrar por
sentimento na página de Reviews não existe. As URLs não preservam estado
de filtro — não há como compartilhar uma busca com um colega.

---

## 2. Inventário de Dados Disponíveis mas Desperdiçados

O banco tem muito mais do que o frontend exibe. Dados presentes e não explorados:

| Campo | Onde existe | Como está sendo usado | Como deveria ser usado |
|---|---|---|---|
| `mention_snippet` | `review_collaborators` | Só no detail dialog, escondido | Exibido direto no card da review e na página do colaborador |
| `match_score` | `review_collaborators` | Mostrado como % no detail, não filtrável | Filtro de confiança de menção (ex: score > 0.8) |
| `is_local_guide` | `reviews` | Badge cosmético no review card | KPI "% de avaliações de Local Guides" — esses reviews têm mais peso no algoritmo Google |
| `reply_time` | `reviews` | Não exibido | Tempo médio de resposta do cartório — métrica de qualidade de atendimento |
| `total_with_reply` | calculado no overview | Não exibido como KPI | Taxa de resposta (%) como KPI primário |
| `sentiment` (pos/neu/neg) | `review_labels` | Badge por review, never aggregated | Distribuição de sentimento mensal (stacked bar) — tendência emocional da base |
| `monthly[]` por collaborator | `CollaboratorMentionOut` | Só usado em PerformancePage (próprio) | Comparativo temporal entre colaboradores (gestor seleciona N pessoas) |
| `rating` distribution | calculável | Só avg existe | Histograma 1★-5★ em cada contexto (global, por colaborador, por período) |
| `collection_runs` | banco, 16 linhas | Não exposto | "Última atualização: X dias atrás" — indicador de freshness visível |
| `audit_log` | banco, Phase 2 | Não exposto na UI | Log de atividade no painel admin |

---

## 3. O que esta fase entrega — 9 capacidades novas

### C1 — Delta temporal em todos os KPIs (comparação período vs. anterior)
**Valor:** transforma números absolutos em sinais de direção.
**Implementação:** `get_overview` recebe `compare_previous=true` e retorna um
segundo bloco `previous_period` com os mesmos KPIs calculados para o período
imediatamente anterior de mesma duração. Frontend exibe delta com seta colorida.
**Exemplo de UX:** "Nota Média: 4.2 ↑ +0.15 vs. 12 meses anteriores"

### C2 — Perfil completo de colaborador para gestores (`/collaborators/:id`)
**Valor:** resolve o maior gap de gestão de equipe.
**Implementação:** nova rota pública (todos os roles autenticados), com:
- KPIs do colaborador: menções, nota média, ranking, taxa de crescimento MoM
- Histograma de distribuição de ratings nas reviews que o mencionam
- Gráfico de evolução mensal de menções + nota (mesmo da PerformancePage)
- Tabela de reviews que o mencionam com coluna de snippet e botão para detail
- Seção de "menções por contexto" — os 5 mention_snippets mais recentes
Backend: `GET /api/v1/collaborators/:id/profile` — agrega tudo em uma chamada.

### C3 — Comparação direta entre colaboradores (overlay de curvas)
**Valor:** permite ao gestor comparar trajetórias, não só posições no ranking.
**Implementação:** em Analytics, checkbox multi-select nos colaboradores da tabela
(máx. 4 simultâneos) → gráfico acima exibe uma linha por colaborador selecionado,
cores distintas da `CHART_COLORS` palette. A tabela já tem os dados `monthly[]`.
Backend: zero mudança (dados já chegam no `collaborator-mentions`).

### C4 — Histograma de distribuição de ratings
**Valor:** distingue consistência de polarização — mudança de percepção completa.
**Implementação:** backend adiciona `rating_distribution: {1: int, 2: int, 3: int, 4: int, 5: int}`
ao `MetricsOverviewOut` e ao `CollaboratorProfileOut`. Frontend exibe como
mini-barras horizontais proporcionais dentro do KPI card (sem biblioteca adicional,
CSS puro com `width: X%`).

### C5 — Filtro cruzado de reviews por colaborador
**Valor:** o gestor consegue ver TODAS as reviews de uma pessoa em contexto real.
**Implementação:** `GET /api/v1/reviews?collaborator_id=5` — backend adiciona JOIN
com `review_collaborators` quando `collaborator_id` está presente. Frontend:
Reviews page ganha Select "Filtrar por colaborador" com lista dos colaboradores
ativos. Também linkado a partir da página do colaborador (C2).

### C6 — URLs com estado de filtro preservado (deep links)
**Valor:** colaboração — "olha esta busca que fiz" por link. Auditoria.
**Implementação:** React Router `useSearchParams` em Reviews e Analytics.
Filtros ativos mapeiam para query string (`?rating=1&collab=5&sort=rating:asc`).
Back/forward do browser mantém filtro. Zero backend.

### C7 — Taxa de resposta como KPI primário + tendência mensal
**Valor:** responsividade é uma das métricas mais visíveis para clientes do cartório.
**Implementação:** `reply_rate_pct = total_with_reply / total_reviews * 100`
já é calculável com dados existentes. Adicionar ao `MetricsOverviewOut` e ao
`MonthData`. No Dashboard: 5º KPI card "Taxa de Resposta". Na trend chart:
linha secundária de taxa de resposta mensal (eixo Y direito, 0-100%).

### C8 — Página de Reviews: filtro por sentimento + modo compacto/expandido
**Valor:** gestores identificam rapidamente o que vai mal sem ler card a card.
**Implementação:** adicionar `sentiment` como filtro no Reviews page (Positivo /
Neutro / Negativo / Sem classificação). Modo compacto (lista densa) vs. card
expandido — toggle no topo, persiste em localStorage.

### C9 — Data freshness indicator + seletor de período customizado
**Valor (freshness):** trust. O usuário sabe se o que vê é de hoje ou de 7 meses atrás.
Implementação: endpoint `GET /api/v1/metrics/data-status` retorna `last_review_date`,
`last_collection_run`, `total_reviews`. Widget persistente no header/sidebar.

**Valor (período customizado):** desbloqueios analíticos que os presets não cobrem.
"Mostre-me Janeiro a Março de 2025" para planejamento sazonal.
Implementação: substituir os Selects de período por um date range picker
(`@tanstack/react-date-range` ou componente shadcn/ui Calendar com range).
Backend já aceita `date_from`/`date_to` — zero mudança de backend.

---

## 4. O que esta fase NÃO faz (decisões explícitas)

- **Sem keyword cloud / análise de texto NLP** — requer Phase 4 (classificador arq).
  As palavras mais frequentes por colaborador poderiam ser feitas com SQL simples,
  mas a qualidade sem stopwords PT-BR é ruim. Adiar para Phase 4+.

- **Sem notificações push / alertas em tempo real** — scope de Phase 4+.

- **Sem export PDF / relatório imprimível** — valor existe mas é Phase 5 scope.
  Adiar para não sobrecarregar Phase 3.7.

- **Sem gráfico de dispersão menções×nota** — interessante, mas o comparativo (C3)
  já cobre a necessidade analítica principal. Adiar.

- **Sem reviewer profiling / top reviewers table** — LGPD: anonimização de
  `reviewer_name` é requisito da Phase 5. Não expor mais PII de reviewers antes
  de ter o endpoint de anonimização. Adiar.

- **Sem internacionalização / `original_language`** — dados de `translated_text`
  são irrelevantes para o público-alvo (PT-BR). Nunca implementar.

---

## 5. Padrões a seguir

- **Reutilizar hooks e componentes existentes** — `useCollaboratorMentions` já traz
  `monthly[]` por colaborador; C3 é apenas uma camada de UI sobre dados existentes.
- **Cursor-based pagination** já implementada em reviews — C5 herda o mesmo padrão.
- **`CHART_COLORS` e `CustomTooltip`** — toda visualização nova usa as constantes
  existentes em `chart-config.ts` e o tooltip PT-BR.
- **TanStack Query** — toda query nova usa `staleTime: 60s` e chave compostas.
- **shadcn/ui** — nenhuma biblioteca de UI nova. Calendar e date-range picker
  usam o primitivo Radix já presente.
- **Lazy loading por rota** — nova rota `/collaborators/:id` segue o padrão de
  `React.lazy` em `routes.tsx`.

---

## 6. Padrões a evitar

- **Não adicionar nova biblioteca de gráficos** — Recharts (já no bundle) cobre
  todos os casos. Adicionar echarts/d3/nivo inflaria o bundle 200+KB.
- **Não criar um endpoint por widget** — os agregados de C2 (perfil do colaborador)
  devem ser um endpoint só, não 5 chamadas separadas que o frontend orquestra.
- **Não duplicar lógica de autorização no frontend** — roles e gates
  ficam nos `RequireAuth`/`RequireRole` existentes, nunca em props condicionais.
- **Não usar `useEffect` para derivar estado** — dados calculados (deltas, rankings,
  distribuições) são calculados no backend ou como `useMemo`, nunca em efeitos.
- **Não usar `mv_monthly`** — materializada pode estar stale; usar live GROUP BY
  conforme padrão já estabelecido em `metrics_service.py`.

---

## 7. Decisões já tomadas

| Decisão | Racional |
|---|---|
| Período customizado via Calendar em vez de adicionar mais presets | Presets não cobrem análises sazonais. Calendar é flexível e o backend já aceita date_from/date_to |
| Perfil do colaborador em rota separada `/collaborators/:id` | Mantém Reviews page focada; permite linking direto; segue o padrão de rotas lazy |
| Delta calculado no backend | Menos round-trips; lógica de datas complexa fica onde há testes; frontend fica dumb |
| Rating distribution como dict `{1:n, 2:n, ...}` adicionado ao overview e ao profile | Schema extensível; sem migração; calculável inline na mesma query |
| Comparativo de colaboradores via multi-select client-side | Os dados `monthly[]` já chegam completos no `collaborator-mentions` response; sem nova rota |
| `data-status` como endpoint separado | Leve, pode ter cache longo (5min), não polui `overview` que é filtrado por período |

---

## 8. Questões em aberto para o Senhor aprovar

**Q1 — Perfil de colaborador: quem pode ver?**
Opção A: todos os roles autenticados (admin, manager, viewer) — maior adoção,
colaborador vê o colega.
Opção B: admin + manager only — mais restrito, evita comparação lateral não solicitada
entre colaboradores.
*Sugestão JARVIS:* Opção A. A tabela comparativa em "Meu Desempenho" já exibe
todos os colaboradores para todos os roles. Consistência.

**Q2 — Comparativo em Analytics: máximo de colaboradores selecionáveis?**
Sugestão: 4 (paleta tem 4 cores distintas). Mais que isso polui o gráfico.

**Q3 — Date range picker: substituir os presets OU adicionar como opção "Customizado"?**
Opção A: Substituir completamente pelos calendários.
Opção B: Manter os presets (3/6/12/tudo) + opção "Período customizado" que abre calendário.
*Sugestão JARVIS:* Opção B. Presets são rápidos para o caso de uso mais comum;
o calendário existe para análises pontuais.

**Q4 — Filtro por colaborador na Reviews page: single ou multi-select?**
Sugestão: multi-select (até 3) para casos de uso comparativos.

**Q5 — Esta fase deve aguardar a Fase 4 (dados frescos) ou rodar antes?**
Argumentos para ANTES: a estrutura analítica será mais visível quando dados
frescos chegarem; demos ficam mais convincentes.
Argumentos para DEPOIS: sem dados novos, features de tendência temporal têm
menos impacto prático imediato.
*Sugestão JARVIS:* Executar antes. A fase não depende de coleta automática;
e os 5.372 reviews históricos são suficientes para demonstrar todas as
capacidades. Fase 4 complementa, não é pré-requisito.

---

## 9. Estimativa de escopo

| Capacidade | Backend | Frontend | Complexidade |
|---|---|---|---|
| C1 — Delta temporal em KPIs | Médio (nova lógica em get_overview) | Médio (componente de delta) | Média |
| C2 — Perfil colaborador | Médio (novo endpoint agregador) | Alto (nova página completa) | Alta |
| C3 — Comparativo de colaboradores | Zero | Médio (multi-select + chart overlay) | Média |
| C4 — Histograma de distribuição | Baixo (add field to queries) | Baixo (CSS bars) | Baixa |
| C5 — Filtro reviews por colaborador | Baixo (add JOIN filter) | Baixo (add Select) | Baixa |
| C6 — URLs com estado | Zero | Médio (useSearchParams migration) | Média |
| C7 — Taxa de resposta | Baixo (add fields to overview+trends) | Baixo (add KPI card + trend line) | Baixa |
| C8 — Filtro por sentimento + modo compacto | Zero | Médio | Média |
| C9 — Data freshness + date range picker | Baixo (data-status endpoint) | Médio (Calendar component) | Média |
| Testes + validação | — | — | — |

**Total:** ~6 waves de implementação. Estimativa: 1 sessão intensa ou 2 sessões moderadas.

---

## 10. Critério de aceitação (preview — SPEC vai detalhar)

O dashboard passa no assessment enterprise-grade quando:

1. Qualquer KPI mostra delta vs. período anterior sem clique adicional
2. Gestor pode acessar `/collaborators/5` e ver perfil completo do João Silva
3. Gestor pode selecionar João + Maria e ver as curvas de menções sobrepostas
4. Card de nota média mostra a distribuição 1-5★ inline (sem tooltip obrigatório)
5. Reviews page aceita `?collaborator_id=5&sentiment=neg&rating=1` e mostra resultado
6. URL reflete todos os filtros ativos; copiar e colar funciona
7. Dashboard mostra "Última atualização: [data]" de forma persistente
8. Date range picker permite selecionar período arbitrário em Calendar
9. Taxa de resposta (%) está nos KPIs e na tendência mensal
10. Todos os novos endpoints têm testes pytest; novos componentes têm vitest

---

**Fim do Design Discussion.** Aguardando aprovação do Senhor para prosseguir com SPEC.md.
