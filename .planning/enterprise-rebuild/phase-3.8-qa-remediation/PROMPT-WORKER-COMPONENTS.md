Senhor, você é um **worker** da **Fase 3.8** (QA Remediation + Time Window Cascading) do Dashboard Cartório Paulista, operando sob a autonomous-harness. Uma sessão MÃE separada está orquestrando N workers paralelos e espera seu sinal DONE via inbox file. Registro PT-BR formal, tratamento "Senhor".

# Escopo deste worker: **Package B — Frontend Components + A11y**

Responsável por **bug fixes reutilizáveis em components/ui + components/reviews + components/layout + A11y**. Outros 2 workers cuidam do backend (A) e das pages Dashboard/Analytics (C). **Não toque Dashboard, Analytics, hooks, api client, types.** Zero overlap com os outros.

# Contexto

- CWD: `/home/lucas/Documentos/CODE/dashboard-cartorio-phase-3.8-components` (worktree `worktree-phase-3.8-components`)
- SPEC + TASKS: `/home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.planning/enterprise-rebuild/phase-3.8-qa-remediation/`
- Git identity configurada
- Stack local rodando. O frontend container `cartorio-frontend` serve o build da main (sem suas mudanças) — OK. Para validar as suas mudanças, você tem 2 opções:
  1. **Rebuild local do seu worktree**: `cd frontend && npm install && npm run build && npm run preview` num port livre (ex: 3001). Custa tempo + porta.
  2. **Validação via typecheck + vitest apenas**: `cd frontend && npx tsc -b --noEmit && npx vitest run`. É o caminho preferido para este worker porque não há integração de runtime nesta wave (componentes puros).

Prefira opção 2. O smoke visual final ficará por conta do reviewer após o merge em main.

# Leitura obrigatória ANTES de tocar em código

1. `/home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.planning/enterprise-rebuild/phase-3.8-qa-remediation/SPEC.md` (seções de bug fixes)
2. `/home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.planning/enterprise-rebuild/phase-3.8-qa-remediation/TASKS.md` (Package B tasks B.1–B.10)
3. Arquivos que VAI modificar (leia antes):
   - `frontend/src/components/ui/calendar.tsx`
   - `frontend/src/components/ui/DateRangePicker.tsx`
   - `frontend/src/components/reviews/CollaboratorMultiSelect.tsx`
   - `frontend/src/components/layout/AppLayout.tsx`
   - `frontend/src/pages/ReviewsPage.tsx` (APENAS partes de sentiment aliases e URL cap do collaborator_id — NÃO reescreva o resto, não toque o layout, apenas o parse de URL)
   - Arquivo onde vive `ReviewDetailDialog` — busque com grep
4. `frontend/src/lib/format.ts` — já tem helpers (`toTitleCase`) que você pode reusar
5. `frontend/src/test/mocks/` — padrões de test setup

# Agent Teams (dentro do worker)

Você é o team-lead. Use `TeamCreate` + teammates:

```
TeamCreate({team_name: "worker-3.8-components", description: "Phase 3.8 UI component fixes + a11y"})
Agent({team_name: "worker-3.8-components", name: "explorer", subagent_type: "Explore", prompt: "Localize o ReviewDetailDialog component, leia calendar.tsx, DateRangePicker.tsx e CollaboratorMultiSelect.tsx e me retorne as 10-20 linhas exatas de cada que descrevem o problema dos bugs F1 (pointer events), F4 (close on first click), F2/F3 (a11y + cap)."})
```

Skills a usar (Skill tool dentro do worker):
- `frontend-design` para manter qualidade visual consistente
- `vercel-react-best-practices` para padrões de a11y e performance

# Missão — implemente todas as tasks B.1–B.10

Ver `TASKS.md §Package B` para detalhe completo. Resumo:

## B.1 — F1 Calendar pointer events (MAJOR)

Bug descrito pelo QA: `<div class="flex justify-center pt-1...">` (caption do mês) intercepta clicks sobre os botões de navegação ◀ ▶. Você precisa inspecionar `frontend/src/components/ui/calendar.tsx` (criado em Phase 3.7 W2, wrapper sobre `react-day-picker@9`) e descobrir o porquê. Prováveis causas:
- Caption tem `absolute inset-0` ou `position: relative` com z-index maior que os botões
- Os botões de navegação estão como filhos de um div com `pointer-events-none` que herdam
- O Chevron component tem um wrapper errado

**Fix sugerido:** `pointer-events-none` no container do caption + `pointer-events-auto` nos botões internos. Ou reordenar o DOM. Teste mentalmente o layout.

**Verificação:** crie um teste vitest que renderiza o Calendar em mode range e dispara `userEvent.click` no botão de previous month. Deve alterar o mês exibido.

## B.2 — F2 + F3 + A5 CollaboratorMultiSelect

Dois problemas:
- **F2 + A5** Itens do dropdown não aparecem em accessibility tree quando renderizados via Portal do base-ui. Provavelmente faltam `role="option"`/`aria-label` nos items.
- **F3** Se URL tem `collaborator_id=1&2&3&4`, a UI mostra apenas 3 chips MAS a API recebe todos os 4. O cap deve valer em AMBOS os lugares.

**Fix:** no hook/handler que parseia o URL (provavelmente `CollaboratorMultiSelect` ou o `ReviewsPage` que passa `collaboratorIds`), aplique `.slice(0, 3)` antes de usar os ids para query E antes de renderizar chips. O cap é uma única operação aplicada o mais cedo possível.

## B.3 — F4 DateRangePicker multi-click

O picker fecha no primeiro clique, aplicando um range de 1 dia. Isso vem de um `onSelect` que chama `setOpen(false)` incondicionalmente. Trocar para fechar apenas quando `range.from && range.to` ambos definidos (ou usar `defaultMonth` + `required` do react-day-picker@9 que já lida com isso).

## B.4 — F6 Sentiment aliases no ReviewsPage

Na função que parseia `searchParams.get('sentiment')`, aceite:
- `positive` → canonicalize para `pos`
- `neutral` → `neu`
- `negative` → `neg`
- `unknown` → `unknown`
- `pos`/`neu`/`neg` → passa direto

Canonicalização acontece ANTES de enviar ao backend. A URL exibida não muda — apenas o valor usado internamente.

## B.5–B.8 — A11y fixes

**A1** (B.5) — H1 duplicado: abrir `AppLayout.tsx`, encontrar onde renderiza "Cartório Paulista" + "Painel de Avaliações" na sidebar, trocar `<h1>` (se houver) por `<p className="text-xl font-semibold">` ou equivalente que NÃO seja H1. O único `<h1>` válido deve ser o título da rota atual (Painel Geral / Avaliações / etc.).

**A2** (B.6) — Skip link: adicionar em `AppLayout.tsx` no topo antes da sidebar:
```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-background px-4 py-2 rounded border">
  Pular para conteúdo principal
</a>
```
E colocar `id="main-content"` no elemento `<main>` do layout.

**A3** (B.7) — ReviewDetailDialog close: encontrar o componente, adicionar `aria-label="Fechar detalhes da avaliação"` no botão de fechar (se usa `Dialog.Close` do base-ui, o `aria-label` vai no `Dialog.Close` ou num `<span className="sr-only">`).

**A4** (B.8) — Hidden combobox inputs: identificar se o Select do período tem inputs ocultos sem label. Se tiver, adicionar `aria-label="Selecionar período"`. Provavelmente em `frontend/src/components/ui/Select.tsx` ou similar.

## B.9 — Testes vitest (≥ 3 novos)

1. CollaboratorMultiSelect: quando recebe 4 ids iniciais, descarta o 4º (chips visíveis = 3, callback recebe 3 ids)
2. ReviewsPage parse de URL: `?sentiment=positive` é normalizado para `pos` na query enviada
3. AppLayout renderiza um único H1 + skip link acessível via keyboard

## B.10 — Commit

```
fix(frontend): phase 3.8 — calendar, multi-select, date picker, a11y

- F1 MAJOR: Calendar nav buttons (◀ ▶) no DateRangePicker não eram
  clicáveis porque o caption div interceptava pointer events. Fix CSS:
  caption com pointer-events-none, botões com pointer-events-auto.
- F2 + F3 + A5: CollaboratorMultiSelect expõe itens via ARIA e impõe
  o cap de 3 tanto no render visual quanto na parsing da URL. Antes,
  URL com 4 ids passava todos para a API.
- F4: DateRangePicker mantém aberto até range completo (from + to).
  Antes, fechava no primeiro clique.
- F6: ReviewsPage aceita ?sentiment=positive como alias de =pos (idem
  neutral/negative).
- A1 A2 A3 A4: único H1 por página, skip link no AppLayout, aria-label
  PT-BR no ReviewDetailDialog close, label no hidden combobox do período.

N novos testes vitest. Zero regressão.
```

# Signaling — como reportar à mãe

Ver SPEC.md §Signaling. Resumo: escreva um arquivo `.txt` em `.orchestrator/inbox/` no main worktree com tag `[CC-WORKER phase-3.8-components] DONE/BLOCKED/NEEDS_INPUT`.

## DONE

```bash
TS=$(date +%s)
cat > /home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.orchestrator/inbox/${TS}-components-DONE.txt <<EOF
[CC-WORKER phase-3.8-components] DONE <commit-hash>

Arquivos modificados: <lista>
Testes: vitest <X> passados (<N> novos)
Typecheck: zero erros
Complicações: <se houver>
EOF
```

## BLOCKED/NEEDS_INPUT

Escreva o file e aguarde resposta em `/home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.orchestrator/outbox/phase-3.8-components-REPLY.txt`. Poll max 20 min, depois tome a opção conservadora e siga.

# Regras invioláveis

1. **NÃO** toque em `DashboardPage.tsx`, `AnalyticsPage.tsx`, `hooks/use-metrics.ts`, `lib/api/metrics.ts`, `types/metrics.ts`, `backend/**`.
2. **NÃO** derrube containers.
3. **NÃO** `git push`, `git reset --hard`, `rm -rf`.
4. **NÃO** fique idle sem signal.
5. Reusar helpers existentes (`toTitleCase`, `formatDecimal`, `CHART_COLORS`).
6. Skill `frontend-design` + `vercel-react-best-practices` obrigatórias para qualquer código React.
7. Registros PT-BR formais nos commits.

# Primeiros passos

1. `git status` — confirme worktree correta
2. Leia SPEC.md §F1–F6 + A1–A5
3. TeamCreate + explorer mapeando os 4 arquivos-chave
4. Implemente B.1–B.10
5. tsc -b --noEmit + vitest run
6. Commit único
7. Inbox file DONE
8. Exit

**Comece agora.**
