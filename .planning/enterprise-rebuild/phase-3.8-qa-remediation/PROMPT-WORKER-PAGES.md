Senhor, você é um **worker** da **Fase 3.8** (QA Remediation + Time Window Cascading) do Dashboard Cartório Paulista, operando sob a autonomous-harness. Uma sessão MÃE separada está orquestrando N workers paralelos e espera seu sinal DONE via inbox file. Registro PT-BR formal, tratamento "Senhor".

# Escopo deste worker: **Package C — Frontend Pages (Dashboard + Analytics)**

Responsável por **time window cascading + daily granularity + UX-2 DeltaBadge N/D**. Pacote mais importante funcionalmente — é o que o Senhor pediu explicitamente: "se seleciono últimos 3 meses, devem aparecer os dados de menções aos colaboradores dos últimos 3 meses, não do período total".

Outros 2 workers em paralelo:
- **A (backend):** adiciona `date_from`/`date_to`/`granularity=day|month` nos endpoints. Você consome.
- **B (components):** corrige bugs em components/ui. Você NÃO toca components/ui nem components/reviews/* nem layout/*.

# Contexto

- CWD: `/home/lucas/Documentos/CODE/dashboard-cartorio-phase-3.8-pages` (worktree `worktree-phase-3.8-pages`)
- SPEC + TASKS: `/home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.planning/enterprise-rebuild/phase-3.8-qa-remediation/`
- Git identity configurada
- Stack local rodando contra código da main (sem mudanças de A, B ou suas)

**Dependência soft sobre Package A:** você implementa contra os contratos do SPEC.md §3.8.A e §3.8.B. Não precisa do commit de A para começar — quando A entrar em main, seus hooks já vão saber conversar com os endpoints novos. O smoke-test visual integrado só acontece depois do merge das 3 worktrees.

# Leitura obrigatória ANTES de tocar em código

1. `/home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.planning/enterprise-rebuild/phase-3.8-qa-remediation/SPEC.md` (§3.8.A, §3.8.B, AC-3.8.9–14)
2. `/home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.planning/enterprise-rebuild/phase-3.8-qa-remediation/TASKS.md` (Package C)
3. Arquivos a modificar (leia antes):
   - `frontend/src/pages/DashboardPage.tsx` (padrão atual de `periodValue`, `customRange`, `dateParams`, `kpiDeltas`, `useMetricsOverview`, `useTrends`, `useCollaboratorMentions`)
   - `frontend/src/pages/AnalyticsPage.tsx` (padrão análogo com `useSearchParams` para `months`/`compare`)
   - `frontend/src/hooks/use-metrics.ts` (hooks a estender)
   - `frontend/src/lib/api/metrics.ts` (fetchers a estender)
   - `frontend/src/types/metrics.ts` (types a estender)
   - `frontend/src/components/charts/CustomTooltip.tsx` (já existe, reutilize)
   - `frontend/src/lib/format.ts` (`MONTHS_PT`, `toTitleCase`, `formatDecimal` — reutilize)
4. **NÃO** precisa ler backend — trabalhe contra os contratos documentados.

# Agent Teams (dentro do worker)

Você é o team-lead. Use `TeamCreate`:

```
TeamCreate({team_name: "worker-3.8-pages", description: "Phase 3.8 pages cascading + daily granularity"})
Agent({team_name: "worker-3.8-pages", name: "explorer", subagent_type: "Explore", prompt: "Mapeie exatamente: (1) como DashboardPage calcula dateParams e qual função usa (presetToDates vs rangeToDates); (2) onde useTrends e useCollaboratorMentions são chamados em DashboardPage e AnalyticsPage; (3) como Analytics usa useSearchParams para months e compare. Retorne linha por linha com referências file:line."})
Agent({team_name: "worker-3.8-pages", name: "implementer", subagent_type: "general-purpose", prompt: "..."})
```

Skills obrigatórias: `frontend-design`, `vercel-react-best-practices`.

# Missão — implemente tasks C.1–C.9

Ver `TASKS.md §Package C`. Resumo:

## C.1 — F5 DeltaBadge N/D quando previous=0

**Arquivo:** `DashboardPage.tsx`, função `kpiDeltas()`

**Antes:**
```ts
return {
  total: overview.total_reviews - prev.total_reviews,
  avg: overview.avg_rating - prev.avg_rating,
  fiveStar: overview.five_star_pct - prev.five_star_pct,
  replyRate: overview.reply_rate_pct - prev.reply_rate_pct,
}
```

**Depois:**
```ts
// Quando o período anterior está vazio (dataset local só vai
// até Set/2025 e o baseline de 12m cai em período vazio), os
// deltas ficariam "+5372" vs 0, o que confunde. Suprimir.
if (prev.total_reviews === 0) {
  return { total: null, avg: null, fiveStar: null, replyRate: null }
}
return { total: ..., avg: ..., fiveStar: ..., replyRate: ... }
```

O `DeltaBadge` já renderiza "Estável" para null.

## C.2 — Estender hooks (`use-metrics.ts`)

```ts
export function useTrends(params?: {
  months?: number
  location_id?: string
  date_from?: string
  date_to?: string
  granularity?: 'month' | 'day'
}) {
  return useQuery({
    queryKey: [
      'metrics-trends',
      params?.months ?? null,
      params?.date_from ?? null,
      params?.date_to ?? null,
      params?.granularity ?? 'month',
      params?.location_id ?? null,
    ],
    queryFn: () => fetchTrends(params),
    staleTime: 60_000,
  })
}

export function useCollaboratorMentions(params?: {
  months?: number
  include_inactive?: boolean
  date_from?: string
  date_to?: string
}) {
  return useQuery({
    queryKey: [
      'metrics-collab-mentions',
      params?.months ?? null,
      params?.include_inactive ?? false,
      params?.date_from ?? null,
      params?.date_to ?? null,
    ],
    queryFn: () => fetchCollaboratorMentions(params),
    staleTime: 60_000,
  })
}
```

## C.3 — API client (`lib/api/metrics.ts`)

```ts
export async function fetchTrends(params?: {
  months?: number
  location_id?: string
  date_from?: string
  date_to?: string
  granularity?: 'month' | 'day'
}): Promise<TrendsData> {
  const { data } = await apiClient.get<TrendsData>(`${BASE}/trends`, { params })
  return data
}

export async function fetchCollaboratorMentions(params?: {
  months?: number
  include_inactive?: boolean
  date_from?: string
  date_to?: string
}): Promise<CollaboratorMentionsData> {
  const { data } = await apiClient.get<CollaboratorMentionsData>(
    `${BASE}/collaborator-mentions`,
    { params }
  )
  return data
}
```

## C.4 — Types (`types/metrics.ts`)

```ts
export interface MonthData {
  month?: string   // presente quando granularity=month
  day?: string     // presente quando granularity=day
  total_reviews: number
  avg_rating: number
  reviews_enotariado: number
  avg_rating_enotariado: number | null
  reply_rate_pct: number
}

export interface TrendsData {
  months: MonthData[]           // nome mantido para compat
  granularity?: 'month' | 'day'
}
```

## C.5 — Helper pickGranularity (`lib/period.ts` novo OU inline)

```ts
// Retorna 'day' quando o range é ≤ 60 dias, 'month' caso contrário.
export function pickGranularity(params: {
  months?: number
  dateFrom?: string
  dateTo?: string
}): 'month' | 'day' {
  if (params.dateFrom && params.dateTo) {
    const diffDays = Math.ceil(
      (new Date(params.dateTo).getTime() - new Date(params.dateFrom).getTime()) / 86400000
    )
    return diffDays <= 60 ? 'day' : 'month'
  }
  if (params.months && params.months <= 2) return 'day'  // "últimos 3 meses" = ~90 dias, fica mensal
  return 'month'
}
```

Nota: "últimos 3 meses" tem ~90 dias, então fica mensal (esperado). O usuário só vê granularidade diária quando escolhe um range custom curto. Isso é uma decisão UX — alinha com a SPEC C6 "auto daily quando ≤ 60 dias". Discuta com a mãe via NEEDS_INPUT se quiser mudar o threshold.

## C.6 — DashboardPage integração

1. `dateParams` (já existe) agora é o SOURCE OF TRUTH. Passe-o para `useTrends` e `useCollaboratorMentions`:
   ```tsx
   const granularity = pickGranularity({ months: presetMonths, dateFrom: dateParams.date_from, dateTo: dateParams.date_to })
   const trends = useTrends({ ...dateParams, granularity })
   const mentions = useCollaboratorMentions({ ...dateParams, months: isCustom ? undefined : presetMonths })
   ```
2. Aplique C.1 (F5 fix do DeltaBadge N/D) em `kpiDeltas()`
3. O componente de chart (inline ou separado) precisa ler `trends.data.granularity` e escolher o campo do eixo X (`month` ou `day`). Formato de tick:
   - month: `"fev 25"` (usar MONTHS_PT)
   - day: `"03 fev"` (usar date-fns ptBR)

## C.7 — AnalyticsPage integração

Mesmo padrão:
1. Extrair `dateParams` do estado híbrido (preset + custom)
2. Passar para `useTrends` E `useCollaboratorMentions`
3. O `LineChart` principal também ganha a lógica de granularidade diária
4. O comparativo de colaboradores (`CollaboratorCompareChart`) passa a receber dados filtrados ao range — verifique se ele precisa mudança ou se já respeita o `monthly[]` vindo do hook

## C.8 — Testes vitest (≥ 3)

1. `kpiDeltas` com `previous_period.total_reviews === 0` retorna todos os campos null
2. `useTrends` query key muda quando `granularity` muda (cache isolado por granularidade)
3. `pickGranularity` retorna 'day' para range ≤ 60 dias e 'month' para > 60 dias (cobrir 3 casos: 30 dias, 60 dias, 61 dias, 90 dias)

## C.9 — Commit

```
feat(frontend): phase 3.8 — time window cascading + daily granularity + delta N/D

Resolve o gap reportado pelo Senhor: 'se seleciono últimos 3 meses, devem
aparecer os dados de menções por colaborador dos últimos 3 meses, não do
período total'. O seletor de período agora propaga date_from/date_to para
useTrends E useCollaboratorMentions em Dashboard e Analytics, fazendo a
tabela Top Mencionados + comparativo de colaboradores todos respeitarem
a janela selecionada.

Adiciona granularidade diária automática: quando o range selecionado é
≤ 60 dias, o gráfico de tendência troca de mensal para diário. Helper
pickGranularity centraliza a decisão. Types TrendsData ganham campo
granularity opcional e MonthData ganha day?: string.

F5 UX: DeltaBadge mostra 'Estável' em vez de '+5372' quando o
previous_period está vazio. kpiDeltas retorna null em todos os campos
quando prev.total_reviews === 0.

<N> novos testes vitest. Zero regressão.
```

# Signaling — como reportar à mãe

## DONE

```bash
TS=$(date +%s)
cat > /home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.orchestrator/inbox/${TS}-pages-DONE.txt <<EOF
[CC-WORKER phase-3.8-pages] DONE <commit-hash>

Arquivos modificados: <lista>
Testes: vitest <X> passados (<N> novos)
Typecheck: zero erros
Smoke: (detalhes ou "skipped — depende de Package A para runtime full")
Complicações: <se houver>
EOF
```

## BLOCKED/NEEDS_INPUT

Mesmo padrão dos outros workers. Inbox em `.orchestrator/inbox/`, resposta esperada em `.orchestrator/outbox/phase-3.8-pages-REPLY.txt`.

# Regras invioláveis

1. **NÃO** toque em `components/ui/*`, `components/reviews/*`, `components/layout/*`, `backend/**`, `supabase/**`, `.planning/**`, `docker-compose*`, `.env*`.
2. **NÃO** derrube containers.
3. **NÃO** `git push`, `git reset --hard`, `rm -rf`.
4. **NÃO** fique idle sem signal.
5. Reutilize helpers (`MONTHS_PT`, `toTitleCase`, `CHART_COLORS`, `CustomTooltip`).
6. Skills `frontend-design` + `vercel-react-best-practices` obrigatórias.
7. Commit messages PT-BR formais.

# Primeiros passos

1. `git status` — confirme worktree
2. SPEC.md + TASKS.md
3. TeamCreate + explorer
4. Implemente C.1–C.9
5. tsc + vitest
6. Commit
7. Inbox DONE
8. Exit

**Pode começar agora.**
