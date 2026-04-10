# TASKS — Phase 3.5: UI Refinement & Collaborator View

**SPEC:** `phase-3.5-ui-refinement/SPEC.md`
**Branch:** `fix/phase-3.5-ui-refinement`

---

## Legenda

- :robot: Agente executa autonomamente
- :standing_person: Gate humano — aguardar aprovação
- [P] Paralelizável
- [S] Sequencial

---

## Wave 1 — Infraestrutura & Setup

| Task | Tipo | Descrição |
|------|------|-----------|
| T3.5.W1.0 | :standing_person: | **GATE MANUAL:** Senhor redefine senha DB via Supabase Dashboard (Settings > Database > Reset password) usando `CartorioDB2026Secure`. Isso restaura a Management API. Confirmar quando feito |
| T3.5.W1.1 | :robot: | Criar branch `fix/phase-3.5-ui-refinement`, subir Docker stack, validar 4/4 healthy |
| T3.5.W1.2 | :robot: | Criar helper `toTitleCase(name: string): string` no frontend — respeita preposições BR (da, de, do, dos, das, e) em minúscula |
| T3.5.W1.3 | :robot: | Criar constantes de paleta de cores para gráficos: `CHART_COLORS` em arquivo de config frontend |
| T3.5.W1.4 | :robot: | Criar componente `CustomTooltip` reutilizável para recharts com formato BR |

**Critério de saída W1:** Stack Docker healthy, helpers criados.

---

## Wave 2 — Correções de bugs funcionais

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.5.W2.0 | :robot: | [S] | **B1:** Diagnosticar e corrigir tabela CollaboratorsPage — restaurar colunas Departamento, Cargo, Menções, Status, Ações. Truncar aliases com "+N mais" após 3 |
| T3.5.W2.1 | :robot: | [S] | Testar tabela via Playwright — confirmar todas as colunas visíveis, sem overflow horizontal |

**Critério de saída W2:** Tabela de colaboradores funcionando 100% com todas as colunas.

---

## Wave 3 — Correções de dados enganosos

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.5.W3.0 | :robot: | [P] | **D1:** Dashboard KPI E-notariado — se total_enotariado==0, mostrar "Classificação pendente" com tooltip explicativo |
| T3.5.W3.1 | :robot: | [P] | **D2:** ReviewsPage — ocultar badge de sentimento quando sentiment é null/unknown |
| T3.5.W3.2 | :robot: | [P] | **D3:** Dashboard gráfico "Evolução da Nota Média" — eixo Y dinâmico baseado no range real dos dados (min-0.2 a max+0.1), ou combinar com gráfico principal como overlay |
| T3.5.W3.3 | :robot: | [P] | **D4:** Analytics — ocultar seção "E-notariado vs. Outras" quando total_enotariado==0 para todos os meses; mostrar mensagem explicativa |
| T3.5.W3.4 | :robot: | [S] | Testar via Playwright — confirmar que dados enganosos foram eliminados |

**Critério de saída W3:** Nenhum zero enganoso, nenhum badge inútil, gráficos com escala útil.

---

## Wave 4 — Melhorias visuais

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.5.W4.0 | :robot: | [P] | **V1:** Aplicar `toTitleCase()` em nomes de colaboradores em todas as páginas (Dashboard, Reviews, Analytics, Collaborators, futuro Performance) |
| T3.5.W4.1 | :robot: | [P] | **V2+V3:** Aplicar paleta de cores nos gráficos + `CustomTooltip` PT-BR em Dashboard e Analytics |
| T3.5.W4.2 | :robot: | [P] | **V4:** Redesign dos KPI cards do Dashboard — background sutil, ícone colorido, hierarquia visual |
| T3.5.W4.3 | :robot: | [P] | **V5:** Página de Login — corrigir "Cartório" com acento, visual mais profissional e alinhado com identidade do sistema |
| T3.5.W4.4 | :robot: | [P] | **V7+V8:** Review cards com hover state + badge de colaborador estilizado |
| T3.5.W4.5 | :robot: | [S] | Testar via Playwright — screenshots antes/depois, validar visual |

**Critério de saída W4:** Interface polida, com cores, hierarquia e identidade visual coerente.

---

## Wave 5 — Melhorias de usabilidade

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.5.W5.0 | :robot: | [S] | **U1:** Filtro de período no Dashboard — Select propagando date_from/date_to para useMetricsOverview e useTrends |
| T3.5.W5.1 | :robot: | [P] | **U2:** Filtro "com resposta/sem resposta" no Reviews — backend: query param `has_reply` (bool); frontend: toggle |
| T3.5.W5.2 | :robot: | [P] | **U3:** Select de ordenação visível no Reviews — "Mais recentes"/"Mais antigas"/"Maior nota"/"Menor nota" |
| T3.5.W5.3 | :robot: | [P] | **U4:** Indicador de progresso "Exibindo X de N avaliações" |
| T3.5.W5.4 | :robot: | [P] | **U5:** Card compacto para reviews sem comentário |
| T3.5.W5.5 | :robot: | [P] | **U6:** Borda lateral colorida por nota nos cards (verde 4-5, amarelo 3, vermelho 1-2) |
| T3.5.W5.6 | :robot: | [S] | Testar via Playwright — filtros, ordenação, indicadores |

**Critério de saída W5:** Todos os filtros e indicadores funcionando, UX polida.

---

## Wave 6 — Visão do Colaborador (nova feature)

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.5.W6.0 | :robot: | [S] | Migration `20260411_add_user_id_to_collaborators.sql` — coluna `user_id` UUID nullable FK auth.users, unique |
| T3.5.W6.1 | :robot: | [S] | Backend: atualizar CollaboratorUpdate schema para aceitar `user_id`; atualizar service para salvar; atualizar endpoint PATCH |
| T3.5.W6.2 | :robot: | [S] | Backend: `GET /api/v1/metrics/my-performance` — retorna métricas do colaborador linkado ao user logado (total_mentions, avg_rating, ranking, monthly breakdown, recent reviews) |
| T3.5.W6.3 | :robot: | [S] | Frontend: types + API client + hook `useMyPerformance()` |
| T3.5.W6.4 | :robot: | [S] | Frontend: `PerformancePage` — KPIs pessoais, gráfico de evolução, tabela comparativa com destaque, lista de reviews filtrada |
| T3.5.W6.5 | :robot: | [S] | Frontend: CollaboratorFormDialog — adicionar dropdown "Vincular a usuário" (lista users do sistema) |
| T3.5.W6.6 | :robot: | [S] | Backend: endpoint auxiliar `GET /api/v1/admin/users` — lista users com role e email (admin only) |
| T3.5.W6.7 | :robot: | [S] | Frontend: rota `/performance` no router, item "Meu Desempenho" na sidebar |
| T3.5.W6.8 | :robot: | [S] | Testar via Playwright — fluxo completo: admin vincula user, user vê métricas |

**Critério de saída W6:** Colaborador logado vê suas métricas, comparativo, e avaliações que o mencionam.

---

## Wave 7 — Testes & Validação final

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.5.W7.0 | :robot: | [S] | Backend pytest: testes para my-performance, user_id update, admin/users (>=10 novos) |
| T3.5.W7.1 | :robot: | [P] | Frontend vitest: testes para PerformancePage, toTitleCase, CustomTooltip (>=8 novos) |
| T3.5.W7.2 | :robot: | [S] | Full regression: `pytest` 134+ green, `vitest` 51+ green |
| T3.5.W7.3 | :robot: | [S] | Docker stack up → login → navegar CADA página → screenshot → validar visual e dados |
| T3.5.W7.4 | :robot: | [S] | Bundle size check: maior chunk < 400KB |

**Critério de saída W7:** Zero regressões, todas as funcionalidades verificadas visualmente.

---

## Wave 8 — Finalização

| Task | Tipo | Dep | Descrição |
|------|------|-----|-----------|
| T3.5.W8.0 | :robot: | [S] | CHECKPOINT.md da Fase 3.5 |
| T3.5.W8.1 | :robot: | [S] | mem_save session_summary |
| T3.5.W8.2 | :robot: | [S] | Atualizar SESSION-OPENING-PROMPT.md da Fase 4 com novo estado |
| T3.5.W8.3 | :standing_person: | [S] | **GATE:** Senhor revisa screenshots finais, aprova merge |
| T3.5.W8.4 | :robot: | [S] | Merge em main, tag `v0.0.5.1-phase-3.5`, push |

---

## Resumo de gates humanos

| Gate | Momento | Ação do Senhor |
|------|---------|----------------|
| T3.5.W1.0 | Antes de tudo | Redefinir senha DB no Supabase Dashboard |
| T3.5.W8.3 | Após testes completos | Aprovar merge |

---

## Estimativa de commits

| Wave | Commits |
|------|---------|
| W1 | 1 (setup + helpers) |
| W2 | 1 (bug fix collaborators table) |
| W3 | 1 (dados enganosos) |
| W4 | 1 (visual polish) |
| W5 | 1 (usabilidade) |
| W6 | 2 (backend + frontend collaborator view) |
| W7 | 1 (testes) |
| W8 | 1 (finalização) |
| **Total** | **~9 commits** |
