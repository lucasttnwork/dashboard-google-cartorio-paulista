# TASKS — Fase 3.9 Dashboard Refinements

**Vinculado a:** `SPEC.md` (mesma pasta)
**Worker alvo:** `frontend-refinements` (1 worker, worktree-única)
**Expectativa:** 1 ciclo de implementação + 1 ciclo de review + merge. Escopo ~10 arquivos, sem paralelização.

---

## Ordem de execução

Tasks devem ser executadas **em ordem numérica**. Cada task inclui: escopo, arquivos, AC cobertos, teste pareado.

---

### T1 — Fix BUG-3.9-1 AnalyticsPage Personalizado (bug cirúrgico primeiro)

**Por que primeiro:** o fix é isolado, baixo risco, e destrava o custom range test de FEAT-3.9-1 no resto do ciclo.

**Arquivos:**
- `frontend/src/pages/AnalyticsPage.tsx`

**Mudanças precisas:**
- Ler `searchParams.get('preset')` em `rawPreset`
- Alterar `isCustom = rawPreset === 'custom' || (rawFrom != null && rawTo != null)`
- Em `handlePeriodChange`:
  - quando `next === 'custom'`: `p.set('preset', 'custom')`
  - quando `next !== 'custom'`: `p.delete('preset')`
- `handleRangeChange` permanece inalterado

**Cobertura:** AC-3.9.1

**Teste pareado:** `frontend/src/pages/AnalyticsPage.test.tsx` — adicionar 2 novos testes:
1. `T1.a` selecionar "Personalizado" no period select → `isCustom` flip imediato, DateRangePicker trigger visível, URL ganha `?preset=custom`
2. `T1.b` com `?preset=custom`, selecionar "Últimos 6 meses" → URL fica `?months=6`, preset limpo, DateRangePicker desaparece

---

### T2 — FEAT-3.9-1: adicionar preset "Últimos 2 meses" default em Dashboard

**Arquivos:**
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/lib/period.ts`
- `frontend/src/lib/period.test.ts`

**Mudanças:**
- `DashboardPage.tsx::PERIOD_OPTIONS` — adicionar `{ value: '2', label: 'Últimos 2 meses' }` como **primeiro** item
- `DashboardPage.tsx::useState<PeriodValue>('12')` → `useState<PeriodValue>('2')`
- `DashboardPage.tsx::periodLabel` fallback `'Últimos 12 meses'` → `'Últimos 2 meses'`
- `lib/period.ts::pickGranularity` — relaxar threshold de `<= 60` para `<= 62` dias, atualizar comentário com rationale "cobre meses de 31+31 dias"
- `lib/period.test.ts` — adicionar 2 testes: `62 dias → 'day'` e `63 dias → 'month'`
- **Não remover** o branch `months <= 2 → 'day'` — ele ganha utilidade agora que preset '2' existe

**Cobertura:** AC-3.9.1a, AC-3.9.1c, AC-3.9.1d

**Teste pareado:** `frontend/src/pages/DashboardPage.test.tsx` — novo teste:
1. `T2.a` renderizar Dashboard sem props iniciais → combobox mostra "Últimos 2 meses", cta default é daily

---

### T3 — FEAT-3.9-1: replicar preset default em Analytics

**Arquivos:**
- `frontend/src/pages/AnalyticsPage.tsx`

**Mudanças:**
- `PERIOD_OPTIONS` — adicionar `{ value: '2', label: 'Últimos 2 meses' }` como primeiro item
- `VALID_PRESET_MONTHS` set — adicionar `'2'`
- Fallback do `periodValue`: `'12'` → `'2'`
- Confirmar que `effectiveMonths` computa corretamente para `'2'`

**Cobertura:** AC-3.9.1b, AC-3.9.1c

**Teste pareado:** `AnalyticsPage.test.tsx` — novo teste:
1. `T3.a` renderizar Analytics sem params → combobox "Últimos 2 meses", useTrends é chamado com `months=2, granularity='day'`
2. `T3.b` selecionar "Últimos 3 meses" após default → URL ganha `?months=3`, chart volta a monthly

---

### T4 — FEAT-3.9-2: Expandir "Colaboradores Mais Mencionados" in-place

**Arquivos:**
- `frontend/src/pages/DashboardPage.tsx`

**Mudanças:**
- Adicionar `useState<boolean>(false)` para `isExpanded`
- `topCollaborators` — quando `isExpanded`, slice `0, all.length`; quando `!isExpanded`, slice `0, 5`
- Renderizar botão no `CardFooter`:
  - `isExpanded === false && mentions.data?.collaborators.length > 5` → `<Button variant="ghost">Ver todos ({N})</Button>`
  - `isExpanded === true` → `<Button variant="ghost">Ver menos</Button>`
- Manter link "Ver todas as análises →" no header (redundância intencional)

**Cobertura:** AC-3.9.2a, AC-3.9.2b, AC-3.9.2c, AC-3.9.2d, AC-3.9.2e

**Teste pareado:** `DashboardPage.test.tsx` — 3 novos testes:
1. `T4.a` com 8 colaboradores mencionados, default → tabela mostra 5 linhas + botão "Ver todos (8)"
2. `T4.b` clicar "Ver todos" → tabela mostra 8 linhas + botão "Ver menos"
3. `T4.c` com 3 colaboradores → botão de expand **não** aparece

---

### T5 — Follow-up SI-1: vitest para Calendar click regression

**Arquivo novo:**
- `frontend/src/components/ui/calendar.test.tsx`

**Escopo:**
- Renderizar `<Calendar mode="range" />` no vitest
- Capturar o texto de mês atual (dev role `status` retorna "abril 2026")
- `userEvent.click(screen.getByRole('button', { name: /previous month/i }))`
- Assert que o status texto mudou para "março 2026"
- Cobre AC-3.8.1 como regressão guard

**Cobertura:** AC-3.9.4 (SI-1)

---

### T6 — Follow-up SI-2: vitest para DateRangePicker auto-close

**Arquivo novo:**
- `frontend/src/components/ui/DateRangePicker.test.tsx`

**Escopo:**
- Renderizar `<DateRangePicker value={{from: null, to: null}} onChange={fn} />`
- `click(getByLabelText('Selecionar período'))` → dialog abre
- `click` em 2 dias distintos via aria-label
- Assert que dialog fechou após 2º click
- Assert que `onChange` foi chamado 2x (ou 1x com range completo)

**Cobertura:** AC-3.9.4 (SI-2)

---

### T7 — Follow-up SI-3: backend `_parse_date` → 422 em ISO malformado

**Arquivos:**
- `backend/app/api/v1/metrics.py` (handler)
- `backend/tests/test_metrics.py` (teste)

**Mudanças:**
- No endpoint `/metrics/trends` e `/metrics/collaborator-mentions`, envolver o call ao service em try/except `ValueError`
- Em caso de `ValueError` vindo de `_parse_date`, levantar `HTTPException(status_code=422, detail="Invalid ISO date in date_from or date_to")`
- Alternativa mais limpa: mover validação de ISO para Pydantic via `Annotated[str, constr(regex=ISO_DATE_REGEX)]`. **Escolha do worker** — decidir e documentar.

**Teste pareado:**
1. `T7.a` GET `/metrics/trends?date_from=garbage&granularity=day` → status 422, mensagem contém "Invalid ISO date"
2. `T7.b` GET `/metrics/collaborator-mentions?date_to=2026-13-40` → status 422

**Cobertura:** AC-3.9.4 (SI-3)

---

### T8 — Regression run completo + smoke runtime local

**Escopo:**
- `cd frontend && npm run test -- --run` → todos os vitest passando (alvo ≥ 96 + novos)
- `cd frontend && npx tsc -b --noEmit` → zero erros
- Backend: `pytest tests/test_metrics.py` via container (worker tem mesmo fluxo docker run da Fase 3.8) → ≥ 31 + T7 passando
- **Smoke empírico manual NÃO é responsabilidade do worker** — a mãe + reviewer fazem isso após merge

**Cobertura:** AC-3.9.5, AC-3.9.6

---

### T9 — Atualizar §Decisão C6 da SPEC 3.8 com threshold 62d

**Arquivo:**
- `.planning/enterprise-rebuild/phase-3.8-qa-remediation/SPEC.md`

**Mudanças:**
- Apêndice ou edição inline na §Decisão C6 registrando que Fase 3.9 relaxou o threshold de 60 para 62 dias para acomodar o preset "Últimos 2 meses" (max 62 dias em meses 31+31)
- Atualizar também a §Decisão C6 item #3 ("presets fixos caem todos em monthly") — agora é falso: o preset novo "2 meses" cai em daily

**Cobertura:** AC-3.9.8

---

### T10 — Commit atômico + DONE signal

**Comando:**
```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(phase-3.9): dashboard refinements — 2mo default + reply queue UX fix + follow-ups

Bug fixes:
- AnalyticsPage: preset "Personalizado" era inalcançável via UI (URL flag
  preset=custom adicionado como sinal explícito)
- _parse_date: ISO malformado agora retorna 422 em vez de 500

Features:
- Novo preset "Últimos 2 meses" em Dashboard + Analytics, como default
- Threshold pickGranularity relaxado para <=62 dias (cobre meses longos)
- Tabela Top Mencionados expansível in-place no Dashboard

Follow-ups (SI-1/SI-2/SI-3 do veredito 3.8):
- Vitest novo para F1 Calendar click regression
- Vitest novo para F4 DateRangePicker auto-close
- Endurecimento de backend: _parse_date validation

Metrics: +N vitest, +2 pytest. Zero regressão.
EOF
)"
```

**Signal DONE:**
```bash
WEZTERM_UNIX_SOCKET=/run/user/1000/wezterm/gui-sock-38590 wezterm cli send-text --pane-id 23 --no-paste $'[CC-WORKER phase-3.9-refinements] DONE — commit <hash>\r'

cat > /home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.orchestrator/inbox/$(date +%s)-refinements-DONE.txt <<EOF
[CC-WORKER phase-3.9-refinements] DONE — <commit hash>
Escopo: T1-T9
Arquivos: <lista>
Testes: vitest <N/N>, pytest <N/N>
Notas: <decisões que o worker tomou em T7, etc>
EOF
```

---

## Estimativa

**Tempo:** 2-3 horas de worker concentrado (Opus + 2-3 teammates paralelos).
**Complexidade:** baixa-média. Nenhuma task é inventiva; todas seguem padrões existentes.
**Instruction budget:** ~35 instruções — dentro do limite CRISPY.
