# VEREDITO DRY — Fase 3.8 Review

**Data:** 2026-04-14
**Reviewer:** sessão Claude Code dedicada (team `reviewer-3_8`)
**Commit baseline main:** `2148333`
**Worktrees auditados:**
- backend `worktree-phase-3.8-backend` @ `7d6ebb1`
- components `worktree-phase-3.8-components` @ `ce3d075`
- pages `worktree-phase-3.8-pages` @ `a99c57e`

---

## D — Discoveries

### Escopo entregue (resumo cruzado contra SPEC)

| Capacidade | Pacote | Estado |
|---|---|---|
| Calendar pointer events (F1) | B | ✅ `calendar.tsx:39-47` — `month_caption: pointer-events-none`, `nav + button_previous/_next: pointer-events-auto`. `months: relative` mantém contexto de posicionamento do nav absoluto. |
| CollaboratorMultiSelect ARIA (F2 / A5) | B | ✅ Delegado ao primitivo `@base-ui/react/select` (`select.tsx:117`, `SelectPrimitive.Item`). Base UI renderiza `role="option"` nativamente; decisão de não tocar o componente é defensável. |
| Cap em 3 via URL (F3) | B | ✅ Aplicado no parse de `useSearchParams` em `ReviewsPage.tsx` (diff mostra slice a 3 antes da query). Teste `F3: caps collaborator_id at 3 when URL carries 4+ values` com `toEqual(['1','2','3'])`. |
| DateRangePicker multi-click (F4) | B | ✅ Funcional via contador `pendingClicks` em `DateRangePicker.tsx:60-84`. Fecha apenas quando `clicks >= 2 && from && to`. Sem vitest dedicado — gap de regressão, não blocker. |
| DeltaBadge N/D quando previous=0 (F5) | C | ✅ `DashboardPage.kpiDeltas` retorna todos os campos `null`; `DeltaBadge` no main renderiza "Estável" com `aria-label="Sem dados de comparação"` para `value == null` (`DeltaBadge.tsx:29`). Contrato honrado. |
| Sentiment alias (F6) | B | ✅ Normalização `positive→pos` no parse do URL antes do fetch. Teste assertivo com mock MSW capturando `capturedSentiment === 'pos'`. |
| H1 único (A1) | B | ✅ `AppLayout.tsx:89-91` troca `<h1>` da sidebar por `<p>`. Teste conta `getAllByRole('heading', { level: 1 })` → length 1. |
| Skip link (A2) | B | ✅ `AppLayout.tsx:154-160` com `href="#main-content"`, PT-BR, `sr-only focus:not-sr-only`; `<main id="main-content">` na linha 218. Teste verifica `getByRole('link', { name: /Pular para conteúdo principal/ })`. |
| Dialog close aria-label PT-BR (A3) | B | ✅ `dialog.tsx` ganhou prop `closeLabel` (default "Fechar"); `ReviewsPage.tsx:313` passa `closeLabel="Fechar detalhes da avaliação"`. Mudança aditiva. |
| Seletor de período aria-label (A4) | B | ✅ `DateRangePicker.tsx:90` — `<Popover.Trigger aria-label="Selecionar período">`. |
| `/metrics/trends` com date_from/date_to/granularity (A.1–A.3) | A | ✅ Smoke integrado OK (vide TR.06). `bucket_unit` validado por Literal FastAPI. |
| `/metrics/collaborator-mentions` com date_from/date_to (A.4–A.5) | A | ✅ Smoke confirma `date_from=2025-06-01&date_to=2025-09-30` restringe de 11 → 5 colaboradores. |
| Cascading dateParams em Dashboard (C.3) | C | ✅ `DashboardPage.tsx:558-580` — `useMemo(dateParams)`, passado para `useTrends` **e** `useCollaboratorMentions`. Comentário AC-3.8.9/10 inline. |
| Cascading dateParams em Analytics (C.4) | C | ✅ `AnalyticsPage.tsx:205, 315-325` — padrão simétrico ao Dashboard. |
| Daily granularity auto (C6) | C | ⚠️ Ver TR.01 risco `AC-3.8.10` abaixo. |
| Types estendidos (C.7) | C | ✅ `types/metrics.ts` ganha `day?: string`, `granularity?: 'month' \| 'day'`. Mudança aditiva, não quebra consumidores. |
| Helper `pickGranularity` (C.5) | C | ⚠️ Branch `months <= 2 → 'day'` é inatingível do Dashboard porque `presetToDates` sempre emite `date_from/date_to` para presets < 60. Dead code defensivo — 🟡. |

---

## R — Risks

### 🔴 Blockers

_Nenhum._

### 🟠 Must Fix

#### MF-1 — AC-3.8.10 literalmente não cumprido ("Últimos 3 meses → granularidade DIÁRIA")

**Fato:** `pickGranularity` (`frontend/src/lib/period.ts:17-22`) retorna `'day'` apenas quando `diffDays <= 60`. O preset "Últimos 3 meses" percorre `presetToDates(3)` (`DashboardPage.tsx:520-530`), que emite `date_from`/`date_to` cobrindo ~90 dias. Logo `90 > 60` → `'month'`.

**Consequência:** selecionar o preset "Últimos 3 meses" mantém o gráfico de tendência em granularidade **mensal**, ainda que o AC-3.8.10 do SPEC diga literalmente: _"gráfico de tendência exibe granularidade DIÁRIA (uma coluna por dia do período)"_.

**Origem:** contradição interna da própria SPEC. AC-3.8.10 pede daily para 3 meses; SPEC §C6 diz _"≤ 60 dias (preset 'últimos 3 meses' ou custom curto)"_ — trata "3 meses" como se fosse ≤ 60 dias quando de fato não é.

**Escolha do worker:** respeitar o threshold 60d e o comentário no commit assume a decisão. Porém **não** escalou via `NEEDS_INPUT`, como o prompt do worker prescrevia ("Discuta com a mãe via NEEDS_INPUT se quiser mudar o threshold").

**Opções para a mãe decidir:**
- **(a) Ajustar threshold para ≤ 90 dias** em `pickGranularity`. Faz o preset "Últimos 3 meses" render 90 colunas diárias. UX discutível (chart cheio de ruído), mas cumpre o AC literal.
- **(b) Caso especial por preset**: se `!isCustom && presetMonths <= 3`, forçar `granularity='day'`. Mais cirúrgico; ignora a regra temporal em favor da regra de preset.
- **(c) Atualizar a SPEC** para remover o exemplo "últimos 3 meses" do AC-3.8.10, ou mudar o AC para "Últimos 2 meses → DIÁRIA". Reconcilia a contradição interna documentando a escolha 60d como intencional.

**Recomendação do reviewer:** **(c)**. O argumento UX do worker é defensável — 90 buckets diários em um KPI chart principal é ruído. Mas a mãe/SPEC-MASTER precisa assinar a correção do AC antes do merge, para que o veredito "aprovado" não fique pendurado num débito silencioso.

#### MF-2 — `pickGranularity` tem branch inatingível

**Fato:** `lib/period.ts:24` — `if (months != null && months <= 2) return 'day'`. Só é alcançado quando `dateFrom`/`dateTo` estão ausentes. Em Dashboard e Analytics, `presetToDates` **sempre** popula ambos para presets < 60, logo esse branch nunca dispara no uso real.

**Classificação:** 🟠 porque acopla-se com MF-1 — se a opção **(b)** for adotada, esse branch ganha significado; se **(c)** for adotada, o branch pode ser removido.

**Ação:** remover o branch OU garantir que `presetToDates` **não** emita datas para presets que devam cair no fluxo "months legacy". Decidir junto com MF-1.

### 🟡 Should Improve

- **SI-1** Nenhum vitest exercita o fix F1 (clique no botão `◀`/`▶` do Calendar). O AC-3.8.1 é um MAJOR que ficou sem teste de regressão. Sugestão: render `<Calendar mode="range">` + `userEvent.click(screen.getByRole('button', { name: /previous/i }))` e assert que o mês exibido mudou.
- **SI-2** Nenhum vitest exercita F4 (DateRangePicker auto-close após 2 cliques). Sugestão: testar o contador `pendingClicks` via seleção dupla no Popover.
- **SI-3** `_parse_date` em `metrics_service.py:36-40` não protege contra ISO malformado — `date.fromisoformat('garbage')` dispara `ValueError`, propagando 500. Considerar `HTTPException(422)` na rota ou validação prévia de string. Baixo risco hoje, mas é um hardening barato.
- **SI-4** Commit do Package B estendeu o escopo para `components/ui/dialog.tsx` (adicionou prop `closeLabel`). Não estava listado nos "Arquivos tocados (somente)" do prompt do worker. Mudança aditiva e justificada, mas é precedente para apertar o gate de escopo em fases futuras.

---

## Métricas

| Frente | backend | components | pages |
|---|---|---|---|
| pytest (worktree) | **31/31 ✓** | N/A | N/A |
| vitest (worktree) | N/A | **87/87 ✓** | **92/92 ✓** |
| tsc `-b --noEmit` | N/A | ✓ zero erros | ✓ zero erros |
| merge dry-run vs main | ✓ clean | ✓ clean | ✓ clean |
| smoke runtime integrado | ✓ (trends daily 24 buckets em Jan 2026, field `day` populado, `month: null`) | ✓ (via scratch merge + rebuild) | ✓ (via scratch merge + rebuild) |

**Novos testes vs SPEC AC-3.8.15 (≥8 pytest + ≥6 vitest):**
- Backend: **9 pytest** novos (TestTrendsGranularity ×5, TestCollaboratorMentionsDateRange ×4) ✓
- Frontend agregado: **13 vitest** novos (B: 4 = A1/A2/F3/F6; C: 9 = pickGranularity ×4, kpiDeltas ×3, useTrends queryKey ×1, useCollaboratorMentions queryKey ×1) ✓
- Individualmente cada package > mínimo de 3 exigido pelos prompts.

**Smoke integrado executado (scratch branch `scratch/reviewer-3.8-smoke`, depois deletada):**
```
login: 200
/api/v1/metrics/trends?months=3
  → granularity: month   buckets: 3   first.month: 2026-01-01T00:00:00+00:00

/api/v1/metrics/trends?date_from=2026-01-01&date_to=2026-01-31&granularity=day
  → granularity: day     buckets: 24  first.day:   2026-01-01T00:00:00+00:00
  → month: None (corretamente omitido)
  → last.day: 2026-01-30T00:00:00+00:00

/api/v1/metrics/collaborator-mentions?date_from=2025-06-01&date_to=2025-09-30
  → collaborators: 5    (vs 11 sem range → filtro temporal funcionando)
```
Container `cartorio-backend` restaurado contra `main` ao final do smoke (imagem rebuildada, containers limpos).

---

## Segurança

- **SQL injection:** `get_trends` usa `text()` com f-string em `bucket_unit`, mas `bucket_unit` é derivado apenas de `granularity` validado por `Literal["month","day"]` na rota — pass. Todos os valores user-supplied (`dt_from`, `dt_to`, `months`, `loc`) via bindparams. `get_collaborator_mentions` usa SQLAlchemy Core `.where()` — bindparams implícitos. 🟢
- **RLS / JWT:** nenhuma mudança em middleware de auth, nem rotas `/auth/*`. Fase 3.8 só adiciona query params a endpoints pré-existentes.
- **Frontend:** sem `dangerouslySetInnerHTML` novo. Nenhum secret hard-coded no diff. Sentiment alias normaliza antes do fetch, sem injection surface.

---

## Y — Yes / No

- [ ] APROVADO — merge imediato A → B → C
- [x] **CORREÇÕES NECESSÁRIAS** — decisão da mãe sobre MF-1 + MF-2, depois merge
- [ ] REJEITADO

### Plano de ação recomendado à mãe

1. **Decidir MF-1**: opção **(a)**, **(b)** ou **(c)**. Recomendação do reviewer: **(c)** — atualizar o SPEC AC-3.8.10 para remover o exemplo "últimos 3 meses" ou reenquadrá-lo como "Últimos 2 meses / custom ≤ 60 dias". Custo: ~5min de edição da SPEC + assinatura da escolha.
2. **Decidir MF-2** junto com MF-1. Se MF-1 = (c), MF-2 vira follow-up opcional: remover o branch morto `months <= 2 → 'day'` de `lib/period.ts:24`, ou deixá-lo como guarda defensiva para callers que não usem `presetToDates`.
3. Se a decisão for (c) **sem** mudança de código: **merge imediato A → B → C em main**, tag `v0.0.5.3-phase-3.8`, atualizar SPEC em commit separado `docs(phase-3.8): reconcile AC-3.8.10 with 60d threshold`. O veredito evolui para APROVADO.
4. Se a decisão exigir mudança de código (a ou b): spawnar correction-worker sobre `worktree-phase-3.8-pages` para ajustar `pickGranularity`, adicionar vitest específico para "Últimos 3 meses → day", rerun da suíte, e repetir o smoke runtime via este reviewer.
5. Endereçar SI-1/SI-2 em fase de follow-up (não bloqueantes).

---

## Referências de código

- **F1 Calendar**: `frontend/src/components/ui/calendar.tsx:33-47`
- **F4 DateRangePicker**: `frontend/src/components/ui/DateRangePicker.tsx:60-84`
- **A1/A2 AppLayout**: `frontend/src/components/layout/AppLayout.tsx:86-95, 154-160, 218`
- **A3 Dialog closeLabel**: `frontend/src/components/ui/dialog.tsx:46-82`
- **F5 kpiDeltas**: `frontend/src/pages/DashboardPage.tsx:kpiDeltas()` + test em `DashboardPage.kpiDeltas.test.ts`
- **C4/C5 cascade**: `DashboardPage.tsx:558-580`, `AnalyticsPage.tsx:205, 315-325`
- **C6 pickGranularity**: `frontend/src/lib/period.ts:11-26` ⚠️ MF-1/MF-2
- **A.1-A.3 trends daily**: `backend/app/services/metrics_service.py:227-313`
- **A.4-A.5 mentions range**: `backend/app/services/metrics_service.py:321-431`

---

*"Reviewer hostil é a defesa final. Um AC literal violado, ainda que por decisão UX defensável, precisa da assinatura da mãe antes de virar fato consumado."*
