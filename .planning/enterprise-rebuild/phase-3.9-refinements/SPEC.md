# SPEC — Fase 3.9 Dashboard Refinements

**Status:** 📝 Draft — aguardando aprovação do Senhor
**Data:** 2026-04-14
**Fase anterior:** 3.8 QA Remediation (mergeada em main local, não pushed)
**Fase seguinte:** 4 Enterprise Depth v2 (indefinida)

---

## Origem

Pós-merge da Fase 3.8, testes manuais via Playwright em `localhost:3000` pelo Senhor e pela mãe revelaram:

1. **1 bug funcional** em AnalyticsPage — seletor "Personalizado" é inalcançável (isCustom flip bug, diagnóstico abaixo)
2. **2 feature requests do Senhor** — default dashboard em "Últimos 2 meses" (preset que não existe ainda) e expansão in-place da tabela "Colaboradores Mais Mencionados"
3. **3 follow-ups** do veredito hostil da Fase 3.8 (SI-1, SI-2, SI-3) — opcionais mas baratos

Tudo é frontend + 1 endurecimento pequeno de backend (SI-3). Sem migrations, sem mudança de contract.

---

## Escopo

### BUG-3.9-1 — AnalyticsPage: preset "Personalizado" é inalcançável

**Sintoma:** na página `/analytics`, abrir o seletor de período e clicar em "Personalizado" é um no-op visível. O combobox continua mostrando "Últimos 12 meses", a URL não muda, o `DateRangePicker` nunca aparece. O usuário não consegue entrar em modo custom.

**Diagnóstico:** `AnalyticsPage.tsx:166` usa `isCustom = rawFrom != null && rawTo != null`. Mas `handlePeriodChange('custom')` (linhas 231-249) apenas deleta `months`, sem setar `from`/`to`. Resultado:
- URL fica sem `from`/`to` → `isCustom = false`
- `periodValue` cai no fallback `'12'` (linhas 167-171)
- Combobox volta a mostrar "Últimos 12 meses"
- `{isCustom && <DateRangePicker>}` não renderiza
- DashboardPage NÃO tem esse bug porque usa `useState` local para `periodValue`, onde `isCustom = periodValue === 'custom'` (boolean direto)

O reviewer hostil da Fase 3.8 auditou apenas o pass-through de `dateParams` para os hooks — não o fluxo de entrada em custom mode. Miss legítimo, capturado agora.

**Fix:** adicionar URL param explícito `preset=custom` como sinal para `isCustom`:

```ts
const rawPreset = searchParams.get('preset')
const isCustom =
  rawPreset === 'custom' || (rawFrom != null && rawTo != null)
```

E em `handlePeriodChange`:
```ts
if (next === 'custom') {
  p.delete('months')
  p.set('preset', 'custom')   // NOVO
} else {
  p.set('months', next)
  p.delete('from')
  p.delete('to')
  p.delete('preset')           // NOVO
}
```

`handleRangeChange` NÃO precisa mudar — uma vez que `from`/`to` estão setados, `isCustom` fica true pela segunda condição.

### FEAT-3.9-1 — Preset "Últimos 2 meses" default

**Requisito do Senhor:** Dashboard e Analytics devem carregar por padrão em "Últimos 2 meses" (em vez de "Últimos 12 meses"), e esse preset precisa ser adicionado à lista — hoje não existe. Consequência natural: a landing page passa a renderizar gráficos em **granularidade diária** por default (2 meses ≈ 60 dias, cai no threshold C6 da Fase 3.8).

**Implicações:**
- `DashboardPage.tsx::PERIOD_OPTIONS` ganha `{ value: '2', label: 'Últimos 2 meses' }` como primeiro item (ordem: 2 → 3 → 6 → 12 → Todo o período → Personalizado)
- `AnalyticsPage.tsx::PERIOD_OPTIONS` idem (a lista lá inclui "24 meses" adicionalmente — manter)
- `VALID_PRESET_MONTHS` (AnalyticsPage) passa a incluir `'2'`
- Default de ambas as páginas muda de `'12'` para `'2'`
- `presetToDates(2)` (DashboardPage) produz `date_from = now - 2 meses`, `date_to = now`. Com ~61 dias, o frontend **excede** o threshold `<=60` de `pickGranularity` em meses com 31+31 dias, caindo em monthly. Precisa ajuste:
  - **Opção (a):** relaxar threshold para `<= 62 dias` em `lib/period.ts`
  - **Opção (b):** `presetToDates(2)` computa um range fixo de 60 dias (2026-02-13 → 2026-04-14) em vez de "último dia do 2º mês atrás"
  - **Opção (c):** aceitar que meses longos (31+31=62d) renderizam monthly e meses curtos (28+31=59d ou 30+31=61d) alternam. Comportamento imprevisível — rejeitado.
  - **Decisão:** **(a)**. Threshold passa a `<= 62`. Cobre qualquer par de 2 meses consecutivos (max = 62d em jan+dez). Atualização documental em `§Decisão C6` da SPEC 3.8.

**AC-3.9.1a** Dashboard carrega sem query string → combobox mostra "Últimos 2 meses", chart renderiza "Avaliações por Dia"
**AC-3.9.1b** Analytics carrega sem query string → idem
**AC-3.9.1c** Selecionar "Últimos 2 meses" manualmente → mesma experiência
**AC-3.9.1d** `pickGranularity({dateFrom: X, dateTo: Y})` com 62 dias retorna `'day'`; com 63 retorna `'month'`

### FEAT-3.9-2 — Expandir "Colaboradores Mais Mencionados" in-place

**Requisito do Senhor:** no Dashboard, a tabela "Colaboradores Mais Mencionados" hoje mostra top 5 + link "Ver todas as análises →" para `/analytics`. Senhor quer **expandir in-place** para mostrar **todos** os colaboradores mencionados no período observado, sem sair da página.

**Backend:** `/api/v1/metrics/collaborator-mentions` já retorna TODOS os colaboradores mencionados no período (linha 367-369 de `metrics_service.py`: `order by total_mentions desc`, sem `.limit()`). Nenhuma mudança backend necessária.

**Design UX (assumido — Senhor pode redirecionar):**
1. Modo **collapsed** (default): top 5 como hoje + botão "Ver todos (N)" no card footer, onde N = total de colaboradores retornados
2. Modo **expanded**: lista completa, botão "Ver menos" no footer
3. Persistência: estado local via `useState` (sem URL) — expand/collapse é navegação UI fleeting
4. Ordenação: mesma de hoje (desc por `total_mentions`)
5. Quando N ≤ 5, esconder o botão "Ver todos"
6. Link "Ver todas as análises →" para `/analytics` permanece no header do card como atalho alternativo

**AC-3.9.2a** Carregar Dashboard → tabela mostra até 5 linhas + botão "Ver todos (N)" se N > 5
**AC-3.9.2b** Clicar "Ver todos" → tabela expande para mostrar N linhas; botão vira "Ver menos"
**AC-3.9.2c** Clicar "Ver menos" → tabela volta a 5 linhas
**AC-3.9.2d** N ≤ 5 → botão de expand não aparece
**AC-3.9.2e** Trocar o período após expandir → tabela re-renderiza com novos dados; estado expand/collapse preserva-se (UX-friendly)

### Follow-ups do reviewer 3.8 (incluídos nesta fase)

**SI-1 / FIX-3.9-T1** — Vitest para BUG-1 Calendar click. Renderizar `<Calendar mode="range">`, `userEvent.click(getByRole('button', { name: /previous/i }))`, assert que o mês exibido mudou. Arquivo: `frontend/src/components/ui/calendar.test.tsx` (novo).

**SI-2 / FIX-3.9-T2** — Vitest para DateRangePicker auto-close após 2 cliques. Renderizar, simular 2 clicks em dias distintos, assert que o dialog fechou. Arquivo: `frontend/src/components/ui/DateRangePicker.test.tsx` (novo).

**SI-3 / FIX-3.9-T3** — `_parse_date` em `backend/app/services/metrics_service.py:36-40` deve retornar HTTPException 422 quando receber string ISO malformada, em vez de propagar `ValueError` → 500. Adicionar um test `test_metrics.py::TestDateRangeValidation::test_invalid_iso_returns_422`. Arquivo: `backend/app/api/v1/metrics.py` + `backend/tests/test_metrics.py`.

---

## Contratos de API

**Sem mudança.** Fase 3.9 é puramente frontend + 1 endurecimento de validação no backend (SI-3). Schemas de `/metrics/trends` e `/metrics/collaborator-mentions` permanecem idênticos à Fase 3.8.

---

## Arquivos afetados

### Frontend
- `frontend/src/pages/AnalyticsPage.tsx` (BUG-3.9-1, FEAT-3.9-1)
- `frontend/src/pages/DashboardPage.tsx` (FEAT-3.9-1, FEAT-3.9-2)
- `frontend/src/lib/period.ts` (FEAT-3.9-1, threshold 60→62)
- `frontend/src/lib/period.test.ts` (teste do novo threshold)
- `frontend/src/pages/AnalyticsPage.test.tsx` (novos testes do preset + custom flip)
- `frontend/src/pages/DashboardPage.test.tsx` (novo teste do default + expand/collapse)
- `frontend/src/components/ui/calendar.test.tsx` (NOVO — SI-1)
- `frontend/src/components/ui/DateRangePicker.test.tsx` (NOVO — SI-2)

### Backend
- `backend/app/api/v1/metrics.py` (SI-3 — handler de ValueError → 422)
- `backend/tests/test_metrics.py` (teste SI-3)

**Total:** ~10 arquivos. Escopo pequeno. **Um único worker frontend é suficiente** — não paralelizar.

---

## Acceptance Criteria agregado

- **AC-3.9.1** BUG-3.9-1 endereçado: clicar "Personalizado" em Analytics entra em modo custom, `DateRangePicker` renderiza, URL ganha `?preset=custom`
- **AC-3.9.2a-d** FEAT-3.9-1 (2 meses default) conforme acima
- **AC-3.9.3a-e** FEAT-3.9-2 (expand collaborators) conforme acima
- **AC-3.9.4** SI-1/SI-2/SI-3 executados, com testes pareados
- **AC-3.9.5** ≥ 6 novos vitest + ≥ 1 novo pytest. Zero regressão (96/96 mínimo + 31/31 mínimo pré-3.9).
- **AC-3.9.6** `tsc -b --noEmit` zero erros
- **AC-3.9.7** Smoke empírico via Playwright MCP validando:
  - Dashboard default em "Últimos 2 meses" com chart daily
  - Analytics `/analytics` default em "Últimos 2 meses" com chart daily
  - Clicar "Personalizado" em Analytics → dialog abre
  - Expandir tabela colaboradores no Dashboard → mostra > 5 linhas
  - Navegação ◀/▶ do calendar continua funcionando (regressão)
- **AC-3.9.8** SPEC-MASTER da fase anterior (§Decisão C6 em phase-3.8) atualizado para refletir novo threshold 62d

---

## Decisões operacionais (flag ao Senhor)

1. **Bundle único vs fases separadas:** proposto **bundle único 3.9 "Dashboard Refinements"** porque o conjunto cabe em um worker em < 40 instruções. Alternativa: 3.9 bug fix + 3.10 features — overhead de SDD desproporcional.

2. **Push da 3.8 primeiro ou empilhar:** proposto **empilhar 3.9 local em cima da 3.8**, publicar tudo junto (tag `v0.0.5.3-phase-3.8` + `v0.0.5.4-phase-3.9`) após aprovação final. Alternativa: push 3.8 agora, 3.9 vira PR separado. Empilhar é mais barato — 1 ciclo de push.

3. **"Expandir colaboradores" = mostrar todos vs top 30:** proposto **mostrar todos** (N costuma ser ≤ 15 com dados reais, data explorada via Playwright mostrou 11 colaboradores no período total). Alternativa: top 30 com scroll. Esperar ver N real para decidir.

4. **Dead branch `months <= 2 → 'day'`** em `lib/period.ts:24` (flagado MF-2 pelo reviewer 3.8): agora passa a ser ALCANÇÁVEL se `presetToDates(2)` eventualmente for chamado sem `date_from`/`date_to` (não é o caso hoje). Manter como guarda defensiva.

5. **Run local worker worker vs uma única wave síncrona da mãe:** escopo é pequeno (~10 arquivos, 1 worker). **Usar harness paralelo mesmo assim** para manter a disciplina SDD e a rastreabilidade via `.orchestrator/inbox/`. Worker único, worktree única `../dashboard-cartorio-phase-3.9-refinements`.

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Mudar default para 2 meses quebra query cache e aumenta latência do landing | Granularidade diária é ~2x mais pesada que mensal mas ainda cai em < 200ms no perfil local. Smoke integrado via Playwright valida. |
| Novo preset "2 meses" em Analytics conflita com `VALID_PRESET_MONTHS` set | Adicionar explicitamente; teste de regressão por unidade. |
| Fix do `isCustom` bug interage com `customRange` local state lazy-init | Worker deve testar o ciclo completo: clicar "Personalizado" → DateRangePicker abre → selecionar range → fechar → mudar para "6 meses" → URL limpa. Cobrir via vitest. |
| Threshold 62 dias pode ainda deixar edge case (ex: 63d em range custom) | Documentar em §Decisão C6 que 62 é o limite para garantir "2 meses consecutivos" sempre cair em daily. Ranges custom > 62d caem em monthly por desenho. |
| SI-3 `_parse_date` → 422 pode afetar testes que usavam `date_from=garbage` | Nenhum teste atual usa input malformado. Confirmar via grep antes de mudar. |

---

## Cadeia de implementação

Fase 3.9 executa com **1 worker** (`frontend-refinements`) em worktree única. Escopo coeso, arquivos sobrepostos, sem vantagem em paralelizar. Reviewer hostil após DONE. Merge + tag + CHECKPOINT como na 3.8.

```
META (este SPEC)
  ↓
IMPL (1 worker frontend-refinements em worktree-phase-3.9)
  ↓
REVIEW (reviewer hostil em sessão dedicada)
  ↓
DECIDE (merge single-branch + tag v0.0.5.4-phase-3.9 + CHECKPOINT)
```

---

## Infraestrutura dev-only (inalterada da 3.8)

Stack Docker idêntica. Credenciais idênticas. Monitor + ScheduleWakeup já ativos.
