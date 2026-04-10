# SPEC — Phase 3.5: UI Refinement & Collaborator View

**Status:** APROVADO PARA EXECUÇÃO
**Author:** JARVIS
**Date:** 2026-04-10
**Depends on:** Phase 3 (Visualization Dashboard) — `v0.0.5-phase-3`
**Branch:** `fix/phase-3.5-ui-refinement`
**Release:** `v0.0.5.1-phase-3.5`

---

## 1. Objetivo

Corrigir **todas** as dívidas técnicas, bugs visuais, problemas de usabilidade
e gaps funcionais identificados durante o teste de integração Docker da Fase 3.
Adicionalmente, implementar a **visão do colaborador** — permitir que
colaboradores comuns (role `viewer`) acompanhem suas próprias métricas e se
comparem com os demais.

Nenhum item deve ser deixado para trás. Cada funcionalidade existente deve
estar testada e funcional antes de prosseguir para a Fase 4.

---

## 2. Diretriz de linguagem (reafirmação)

Toda a interface em português brasileiro com ortografia, acentuação e
gramática impecáveis. Números no formato BR (1.234 / 4,72). Datas dd/mm/aaaa.
Meses abreviados em PT ("Jan", "Fev", "Mar"...). Linguagem simples — até
uma criança deve entender. Decisão D3.9, permanente.

---

## 3. Diagnóstico completo (itens a resolver)

### 3.1 Bugs funcionais (CRÍTICO)

| # | Bug | Onde | Causa provável |
|---|-----|------|----------------|
| B1 | Tabela de Colaboradores perdeu colunas (Departamento, Cargo, Menções, Status, Ações) — só mostra Nome + aliases | `/admin/collaborators` | Regressão na migração TanStack Query ou overflow horizontal sem tratamento |
| B2 | Supabase Management API quebrada após ALTER ROLE postgres | Infraestrutura | Senha DB mudada via SQL; precisa redefinir via Dashboard Supabase para restaurar a Management API |

### 3.2 Dados enganosos (ALTO — compromete o propósito)

| # | Problema | Onde | Solução |
|---|----------|------|---------|
| D1 | KPI "Avaliações E-notariado: 0,0%" exibido com destaque | Dashboard | Se `total_enotariado == 0`: mostrar "Classificação pendente" em vez de 0,0%, com tooltip explicando que o classificador ainda não foi executado |
| D2 | Badge "Sem classificação" em TODA avaliação | Reviews | Se sentiment é null/unknown: ocultar o badge completamente. Só exibir quando há classificação real (Positivo/Neutro/Negativo) |
| D3 | Gráfico "Evolução da Nota Média" com eixo Y 0-5 para dados entre 4.8-5.0 | Dashboard | Eixo Y dinâmico: domain `[min - 0.2, 5]` em vez de `[0, 5]`. Ou remover este gráfico redundante e colocar a linha de nota média como overlay no gráfico principal (como já feito na Analytics) |
| D4 | Gráfico "E-notariado vs. Outras" 100% cinza | Analytics | Se `total_enotariado == 0` para todos os meses: ocultar a seção inteira e mostrar mensagem "A classificação E-notariado será exibida após a execução do classificador automático" |

### 3.3 Problemas visuais (MÉDIO)

| # | Problema | Onde | Solução |
|---|----------|------|---------|
| V1 | Nomes de colaboradores em CAIXA ALTA | Todas as páginas | Helper `toTitleCase()` na exibição. Dados no banco ficam como estão |
| V2 | Gráficos monocromáticos (preto/cinza/azul claro) | Dashboard + Analytics | Paleta definida: azul principal `#3b82f6`, âmbar para nota `#f59e0b`, verde para e-notariado `#10b981`, cinza para secundários |
| V3 | Tooltips dos gráficos em estilo padrão recharts | Dashboard + Analytics | Tooltip customizado com fundo card, texto PT-BR, números formatados BR |
| V4 | Cards KPI sem cor de destaque ou hierarquia | Dashboard | Background sutil (ex: `bg-blue-50/50`), ícone com cor, value em font-size maior |
| V5 | Login: "Cartorio" sem acento, visual genérico | `/login` | Corrigir para "Cartório Paulista", adicionar subtítulo descritivo, background sutil, styling mais profissional |
| V6 | Aliases overflow na tabela de colaboradores | `/admin/collaborators` | Truncar com "+N mais" após 3 aliases visíveis |
| V7 | Review cards sem hover state | `/reviews` | Adicionar `hover:shadow-md hover:border-primary/20 transition-shadow` |
| V8 | Badge de colaborador mencionado sem estilização | `/reviews` | Badge com cor de fundo sutil (ex: `bg-blue-50 text-blue-700`) |

### 3.4 Gaps de usabilidade (MÉDIO)

| # | Gap | Onde | Solução |
|---|-----|------|---------|
| U1 | Sem filtro de período no Dashboard | `/dashboard` | Adicionar Select com "Últimos 3 meses" / "6 meses" / "12 meses" / "Todo o período" — propagar para KPIs e gráficos |
| U2 | Sem filtro "com resposta/sem resposta" nos Reviews | `/reviews` | Adicionar toggle ou select: "Todas" / "Com resposta" / "Sem resposta" |
| U3 | Sem opções de ordenação visíveis nos Reviews | `/reviews` | Adicionar select: "Mais recentes" / "Mais antigas" / "Maior nota" / "Menor nota" |
| U4 | "Carregar mais" sem indicação de progresso | `/reviews` | Mostrar "Exibindo 50 de 5.372 avaliações" acima da lista, incrementando conforme carrega mais |
| U5 | "Sem comentário" ocupa mesmo espaço que avaliação com texto | `/reviews` | Card compacto quando sem comentário — menor padding, single line |
| U6 | Falta indicação visual para avaliações negativas (1-2 estrelas) | `/reviews` | Border-left colorido: verde (4-5), amarelo (3), vermelho (1-2) |
| U7 | Clique no card de review sem feedback visual | `/reviews` | Hover state + cursor-pointer + indicação "clique para detalhes" |

### 3.5 Nova feature — Visão do Colaborador

| # | Requisito | Descrição |
|---|-----------|-----------|
| F1 | Página "Meu Desempenho" (`/performance`) | Acessível por qualquer role. Se role=viewer e o user está linkado a um colaborador, mostra métricas pessoais |
| F2 | KPIs pessoais | Total de menções, nota média nas avaliações que mencionam o colaborador, ranking entre os colaboradores |
| F3 | Gráfico de evolução pessoal | Menções por mês + nota média por mês (últimos 12 meses) |
| F4 | Comparativo com demais | Tabela de todos os colaboradores com destaque na linha do colaborador logado |
| F5 | Lista de avaliações que mencionam o colaborador | Filtrada automaticamente, com link para detalhe |
| F6 | Endpoint backend | `GET /api/v1/metrics/my-performance` — retorna métricas do colaborador linkado ao user_id logado |
| F7 | Linking user ↔ collaborator | Coluna `user_id` na tabela `collaborators` (nullable, FK para auth.users). Admin liga o user ao colaborador via painel admin |
| F8 | Navegação | Sidebar: novo item "Meu Desempenho" (ícone UserCircle) visível para todos os roles, entre "Análises" e "Administração" |

**Nota sobre F7:** A tabela `collaborators` atualmente não tem `user_id`. Será necessária uma migration para adicioná-la. O admin liga manualmente cada user a um colaborador via UI (dropdown na edição do colaborador). Um user não linkado vê a página "Meu Desempenho" com mensagem: "Seu perfil ainda não foi vinculado a um colaborador. Solicite ao administrador."

---

## 4. Acceptance Criteria

### Bugs funcionais

**AC-3.5.1 — Tabela de colaboradores completa**
**Given** admin em `/admin/collaborators`
**When** a página carrega com dados reais
**Then** exibe TODAS as colunas: Nome (com aliases truncados), Departamento,
Cargo, Menções, Status (Ativo/Inativo), Ações (dropdown com Editar/Desativar).
Sem scroll horizontal em viewport 1280px+.

**AC-3.5.2 — Supabase Management API restaurada**
**Given** `SUPABASE_ACCESS_TOKEN` configurado
**When** executa query via Management API
**Then** retorna dados corretamente (sem "Database authentication failed").

### Dados enganosos

**AC-3.5.3 — E-notariado KPI contextualizado**
**Given** nenhum review com `is_enotariado=true` no banco
**When** Dashboard carrega
**Then** card E-notariado mostra "Classificação pendente" (texto, não 0,0%)
com tooltip: "O classificador automático ainda não foi executado."

**AC-3.5.4 — Sem badge "Sem classificação"**
**Given** review sem `sentiment` classificado
**When** aparece na lista de avaliações
**Then** NÃO exibe badge de classificação. Espaço é omitido.

**AC-3.5.5 — Gráfico de nota média com escala útil**
**Given** notas variando entre 4.8 e 5.0
**When** gráfico de evolução renderiza
**Then** eixo Y mostra range dinâmico (ex: 4.6 a 5.0), tornando variações
visíveis. Não começa em 0.

**AC-3.5.6 — Seção E-notariado oculta quando sem dados**
**Given** `total_enotariado == 0` para todos os meses
**When** Analytics carrega
**Then** seção "Avaliações E-notariado vs. Outras" não é renderizada.
Em seu lugar, texto: "A classificação E-notariado será exibida após
a execução do classificador automático."

### Visual

**AC-3.5.7 — Nomes em Title Case**
**Given** colaborador cadastrado como "LETICIA ANDREZA DA SILVA"
**When** exibido em qualquer página
**Then** aparece como "Letícia Andreza da Silva" (Title Case BR, preposições
minúsculas).

**AC-3.5.8 — Paleta de cores definida nos gráficos**
**Given** qualquer gráfico
**When** renderiza
**Then** usa azul (#3b82f6) para barras de avaliações, âmbar (#f59e0b) para
linha de nota média, verde (#10b981) para e-notariado. Tooltip customizado
com formato BR.

**AC-3.5.9 — Login com acentuação e identidade**
**Given** página `/login`
**When** renderiza
**Then** exibe "Cartório Paulista" com acento, subtítulo descritivo,
visual profissional e alinhado com o restante do sistema.

### Usabilidade

**AC-3.5.10 — Filtro de período no Dashboard**
**Given** admin em `/dashboard`
**When** seleciona "Últimos 3 meses"
**Then** KPIs e gráficos recalculam para o período selecionado.

**AC-3.5.11 — Reviews com indicação de nota (cor lateral)**
**Given** avaliação com nota 1 ou 2
**When** renderiza na lista
**Then** card tem borda esquerda vermelha. Nota 3: amarela. Nota 4-5: verde.

**AC-3.5.12 — Ordenação visível em Reviews**
**Given** usuário em `/reviews`
**When** visualiza a lista
**Then** há select de ordenação: "Mais recentes" / "Mais antigas" /
"Maior nota" / "Menor nota".

**AC-3.5.13 — Progresso de carregamento em Reviews**
**Given** 5.372 avaliações no banco
**When** usuário vê a lista
**Then** texto acima mostra "Exibindo X de 5.372 avaliações" (X incrementa
ao carregar mais).

### Visão do Colaborador

**AC-3.5.14 — Página "Meu Desempenho" acessível**
**Given** qualquer usuário autenticado
**When** navega para `/performance`
**Then** página carrega. Se user está linkado a um colaborador, exibe métricas
pessoais. Se não, exibe mensagem orientando a solicitar vínculo ao admin.

**AC-3.5.15 — KPIs pessoais do colaborador**
**Given** user linkado ao colaborador "Karen Silva Figueiredo" (275 menções)
**When** acessa `/performance`
**Then** exibe: total de menções, nota média, ranking (#5 de 13),
gráfico de evolução mensal.

**AC-3.5.16 — Comparativo entre colaboradores**
**Given** user logado como colaborador
**When** visualiza tabela comparativa em `/performance`
**Then** todos os colaboradores ativos são listados, com a linha do user
logado destacada visualmente (fundo colorido, ícone "Você").

**AC-3.5.17 — Avaliações que mencionam o colaborador**
**Given** user linkado a um colaborador
**When** visualiza seção "Avaliações que me mencionam"
**Then** lista filtrada de reviews com menção ao colaborador, paginada,
com link para detalhe.

**AC-3.5.18 — Admin vincula user a colaborador**
**Given** admin editando um colaborador
**When** seleciona um user no dropdown "Vincular a usuário"
**Then** user_id é salvo na tabela collaborators. O user vinculado passa
a ver suas métricas em `/performance`.

**AC-3.5.19 — Migration user_id em collaborators**
**Given** migration aplicada
**When** consulta tabela collaborators
**Then** coluna `user_id` (UUID, nullable, FK auth.users) existe.

---

## 5. Invariantes

- I-3.5.1: Nenhum dado mockado ou fallback silencioso.
- I-3.5.2: Nenhuma string visível ao usuário em inglês.
- I-3.5.3: Nenhuma migration existente é modificada.
- I-3.5.4: Roles preservados: admin (tudo), manager (CRUD dados), viewer (leitura + performance pessoal).
- I-3.5.5: Código-fonte em inglês; interface em português.

---

## 6. Decisões técnicas

| ID | Decisão | Justificativa |
|---|---------|---------------|
| D3.5.1 | Title Case via helper frontend, não altera dados no banco | Dados originais preservados; exibição normalizada |
| D3.5.2 | Ocultar métricas que dependem de NLP (não falsificar) | Honestidade > completude visual |
| D3.5.3 | Migration `user_id` em collaborators é nullable | Não quebra dados existentes; vínculo gradual |
| D3.5.4 | `/performance` acessível a todos, conteúdo personalizado por vínculo | Simplifica routing; incentiva admin a vincular |
| D3.5.5 | Paleta de cores fixa para gráficos (CSS variables) | Consistência visual cross-page |
