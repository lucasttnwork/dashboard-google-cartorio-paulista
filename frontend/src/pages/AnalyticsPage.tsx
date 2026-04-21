import { useCallback, useMemo, useState, useTransition } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, Info, TrendingUp, Users } from 'lucide-react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DateRangePicker,
  type DateRangeValue,
} from '@/components/ui/DateRangePicker'
import { useCollaboratorMentions, useTrends } from '@/hooks/use-metrics'
import { toTitleCase } from '@/lib/format'
import { CHART_COLORS } from '@/lib/chart-config'
import { CustomTooltip as PremiumTooltip } from '@/components/charts/CustomTooltip'
import { CollaboratorCompareChart } from '@/components/charts/CollaboratorCompareChart'
import { cn } from '@/lib/utils'
import { isoDateLocal, parseLocalDate, pickGranularity } from '@/lib/period'
import type { TrendsGranularity } from '@/types/metrics'

// ---------------------------------------------------------------------------
// Local formatters — intentionally duplicated from `lib/format` so this page
// can keep a legacy `formatDecimal` signature that tolerates `null` without
// leaking the nullability into the shared util.
// ---------------------------------------------------------------------------

const MONTHS_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

function formatMonth(iso: string): string {
  const d = parseLocalDate(iso) ?? new Date(iso)
  return `${MONTHS_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`
}

function formatDay(iso: string): string {
  const d = parseLocalDate(iso) ?? new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  return `${dd} ${(MONTHS_PT[d.getMonth()] ?? '').toLowerCase()}`
}

function bucketLabel(
  bucket: { month?: string; day?: string },
  granularity: TrendsGranularity,
): string {
  if (granularity === 'day' && bucket.day) return formatDay(bucket.day)
  if (bucket.month) return formatMonth(bucket.month)
  if (bucket.day) return formatDay(bucket.day)
  return ''
}

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

function formatDecimal(n: number | null, digits = 2): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

// ---------------------------------------------------------------------------
// Period options — hybrid preset + custom range (AC-3.7.5 / AC-3.7.16)
// ---------------------------------------------------------------------------

const PERIOD_OPTIONS = [
  { value: 'current-month', label: 'Mês atual' },
  { value: '2', label: 'Últimos 2 meses' },
  { value: '3', label: 'Últimos 3 meses' },
  { value: '6', label: 'Últimos 6 meses' },
  { value: '12', label: 'Últimos 12 meses' },
  { value: '24', label: 'Últimos 24 meses' },
  { value: '60', label: 'Todo o período' },
  { value: 'custom', label: 'Personalizado' },
] as const

type PeriodValue = (typeof PERIOD_OPTIONS)[number]['value']

const VALID_PRESET_MONTHS = new Set(['2', '3', '6', '12', '24', '60'])
const MAX_COMPARE = 4

/**
 * Derive the [first-of-month, today] window for the "Mês atual" preset.
 * Recomputed on every render so the window slides forward naturally as
 * the calendar day changes — no effect needed.
 */
function currentMonthDates(): { date_from: string; date_to: string } {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  return { date_from: isoDateLocal(first), date_to: isoDateLocal(now) }
}

/**
 * Approximate a custom `[from, to]` range as an integer number of months
 * clamped to `[1, 60]`. Both `useTrends` and `useCollaboratorMentions`
 * currently accept only `months`; this keeps the hybrid picker functional
 * while the backend is still a months-only contract.
 */
function rangeToMonths(from: Date, to: Date): number {
  const diffMs = Math.max(0, to.getTime() - from.getTime())
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return Math.min(60, Math.max(1, Math.ceil(diffDays / 30)))
}

/**
 * Parse the `compare` query param. Accepts either CSV (`3,5`) or repeated
 * (`compare=3&compare=5`) forms. Returns a deduplicated list of numeric ids,
 * capped at `MAX_COMPARE` to match AC-3.7.11.
 */
function parseCompareParam(searchParams: URLSearchParams): number[] {
  const raw = searchParams.getAll('compare')
  const tokens = raw.flatMap((entry) => entry.split(','))
  const ids: number[] = []
  const seen = new Set<number>()
  for (const token of tokens) {
    const trimmed = token.trim()
    if (!trimmed) continue
    const n = Number(trimmed)
    if (!Number.isInteger(n) || n <= 0) continue
    if (seen.has(n)) continue
    seen.add(n)
    ids.push(n)
    if (ids.length >= MAX_COMPARE) break
  }
  return ids
}

// ---------------------------------------------------------------------------
// AnalyticsPage
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [, startTransition] = useTransition()

  // -----------------------------------------------------------------------
  // URL-backed period state (AC-3.7.16)
  // -----------------------------------------------------------------------

  const rawMonths = searchParams.get('months')
  const rawFrom = searchParams.get('from')
  const rawTo = searchParams.get('to')
  const rawPreset = searchParams.get('preset')

  /**
   * Applied period derived from the URL — the only thing that drives data
   * hooks. Default is `current-month` (1st of the calendar month → today)
   * so the landing view always opens on "what happened this month".
   *
   * Note: custom mode requires both `from` and `to` in the URL. Clicking
   * "Personalizado" in the dropdown no longer writes `preset=custom` on
   * its own; the URL only flips to custom once the user clicks Aplicar.
   */
  const appliedMode: PeriodValue = useMemo(() => {
    if (rawFrom && rawTo) return 'custom'
    if (rawPreset === 'current-month') return 'current-month'
    if (rawMonths && VALID_PRESET_MONTHS.has(rawMonths)) {
      return rawMonths as PeriodValue
    }
    return 'current-month'
  }, [rawFrom, rawTo, rawPreset, rawMonths])

  const appliedRange: DateRangeValue = useMemo(() => {
    if (appliedMode !== 'custom') return { from: null, to: null }
    return {
      from: rawFrom ? parseLocalDate(rawFrom) : null,
      to: rawTo ? parseLocalDate(rawTo) : null,
    }
  }, [appliedMode, rawFrom, rawTo])

  /**
   * UI dropdown may drift from the URL while the user is in "Personalizado"
   * mode but hasn't clicked Aplicar yet — that's the whole point of the
   * deferred-apply flow. Initial value mirrors the URL-derived state.
   */
  const [uiMode, setUiMode] = useState<PeriodValue>(appliedMode)
  const [customAutoOpen, setCustomAutoOpen] = useState(false)

  /**
   * Absolute date window used by both hooks. Computed from the APPLIED URL
   * state — never from the dropdown override — so switching the Select to
   * "Personalizado" without applying a range leaves the window untouched.
   */
  const dateParams: { date_from?: string; date_to?: string } = useMemo(() => {
    if (appliedMode === 'custom') {
      if (!appliedRange.from || !appliedRange.to) return {}
      return {
        date_from: isoDateLocal(appliedRange.from),
        date_to: isoDateLocal(appliedRange.to),
      }
    }
    if (appliedMode === 'current-month') return currentMonthDates()
    return {}
  }, [appliedMode, appliedRange])

  /**
   * Effective `months` param for hooks that still accept months-only.
   * Custom + current-month pass undefined and rely on date_from/date_to.
   */
  const effectiveMonths: number | undefined = useMemo(() => {
    if (appliedMode === 'custom') {
      if (appliedRange.from && appliedRange.to) {
        return rangeToMonths(appliedRange.from, appliedRange.to)
      }
      return undefined
    }
    if (appliedMode === 'current-month') return undefined
    return Number(appliedMode)
  }, [appliedMode, appliedRange])

  const granularity: TrendsGranularity = useMemo(
    () =>
      pickGranularity({
        months:
          appliedMode === 'custom' || appliedMode === 'current-month'
            ? undefined
            : Number(appliedMode),
        dateFrom: dateParams.date_from,
        dateTo: dateParams.date_to,
      }),
    [appliedMode, dateParams.date_from, dateParams.date_to],
  )

  const handlePeriodChange = useCallback(
    (next: PeriodValue) => {
      setUiMode(next)
      if (next === 'custom') {
        // Pop the picker open. Do NOT mutate the URL — the applied window
        // only flips once the user clicks Aplicar.
        setCustomAutoOpen(true)
        return
      }
      startTransition(() => {
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev)
            p.delete('from')
            p.delete('to')
            if (next === 'current-month') {
              p.delete('months')
              p.set('preset', 'current-month')
            } else {
              p.delete('preset')
              p.set('months', next)
            }
            return p
          },
          { replace: true },
        )
      })
    },
    [setSearchParams],
  )

  const handleRangeApply = useCallback(
    (range: DateRangeValue) => {
      if (!range.from || !range.to) return
      setCustomAutoOpen(false)
      startTransition(() => {
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev)
            p.delete('months')
            p.delete('preset')
            p.set('from', isoDateLocal(range.from as Date))
            p.set('to', isoDateLocal(range.to as Date))
            return p
          },
          { replace: true },
        )
      })
    },
    [setSearchParams],
  )

  // -----------------------------------------------------------------------
  // URL-backed comparison selection (AC-3.7.11 / AC-3.7.16)
  // -----------------------------------------------------------------------

  const selectedIds = useMemo(
    () => parseCompareParam(searchParams),
    [searchParams],
  )

  const toggleCompareId = useCallback(
    (id: number) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          const current = parseCompareParam(p)
          const exists = current.includes(id)
          const next = exists
            ? current.filter((x) => x !== id)
            : current.length >= MAX_COMPARE
              ? current
              : [...current, id]
          p.delete('compare')
          if (next.length > 0) {
            p.set('compare', next.join(','))
          }
          return p
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // -----------------------------------------------------------------------
  // Local UI state
  // -----------------------------------------------------------------------

  const [includeInactive, setIncludeInactive] = useState(false)
  const [showReplyRate, setShowReplyRate] = useState(false)

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const trends = useTrends({
    months: effectiveMonths,
    date_from: dateParams.date_from,
    date_to: dateParams.date_to,
    granularity,
  })
  const collaborators = useCollaboratorMentions({
    months: effectiveMonths,
    include_inactive: includeInactive,
    date_from: dateParams.date_from,
    date_to: dateParams.date_to,
  })

  const effectiveGranularity: TrendsGranularity =
    trends.data?.granularity ?? granularity

  const chartData =
    trends.data?.months.map((m) => ({
      ...m,
      label: bucketLabel(m, effectiveGranularity),
      other_reviews: m.total_reviews - m.reviews_enotariado,
    })) ?? []

  // Resolve selected ids into the current data slice so stale ids (e.g. a
  // collaborator removed between reloads) silently drop out.
  const selectedCollaborators = useMemo(() => {
    const all = collaborators.data?.collaborators ?? []
    const byId = new Map(all.map((c) => [c.collaborator_id, c]))
    return selectedIds
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => c != null)
  }, [collaborators.data, selectedIds])

  const periodLabel =
    PERIOD_OPTIONS.find((o) => o.value === uiMode)?.label ?? 'Mês atual'

  const pickerValue: DateRangeValue =
    appliedMode === 'custom' ? appliedRange : { from: null, to: null }

  const showCompareChart = selectedCollaborators.length >= 2

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Page header + period picker                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Análises</h1>
          <p className="text-muted-foreground">
            Tendências e desempenho detalhado
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Select
            value={uiMode}
            onValueChange={(v) => handlePeriodChange(v as PeriodValue)}
          >
            <SelectTrigger className="w-[200px]">
              <span>{periodLabel}</span>
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {uiMode === 'custom' && (
            <DateRangePicker
              value={pickerValue}
              onApply={handleRangeApply}
              autoOpen={customAutoOpen}
              placeholder="Selecionar período"
            />
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Section 1: Tendência da Nota Média + opcional Taxa de Resposta    */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Tendência da Nota Média
          </CardTitle>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border text-primary accent-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              checked={showReplyRate}
              onChange={(e) => setShowReplyRate(e.target.checked)}
            />
            Exibir taxa de resposta
          </label>
        </CardHeader>
        <CardContent>
          {trends.isLoading ? (
            <Skeleton className="h-[350px] w-full" />
          ) : trends.isError ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Não foi possível carregar o gráfico.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={CHART_COLORS.gridLine}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  allowDecimals={false}
                  label={{
                    value: 'Avaliações',
                    angle: -90,
                    position: 'insideLeft',
                    style: {
                      fontSize: 12,
                      fill: 'var(--color-muted-foreground)',
                    },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={showReplyRate ? [0, 100] : [0, 5]}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  label={{
                    value: showReplyRate ? 'Nota / Taxa (%)' : 'Nota',
                    angle: 90,
                    position: 'insideRight',
                    style: {
                      fontSize: 12,
                      fill: 'var(--color-muted-foreground)',
                    },
                  }}
                />
                <Tooltip content={<PremiumTooltip />} />
                <Legend />
                <Bar
                  yAxisId="left"
                  dataKey="total_reviews"
                  name="Avaliações"
                  fill={CHART_COLORS.blue}
                  radius={[4, 4, 0, 0]}
                  opacity={0.85}
                />
                {/*
                  When the reply-rate toggle is on we rescale the right axis
                  to 0-100 so the percentage line shares domain with a
                  normalized rating (multiplied by 20). When the toggle is
                  off we keep the historic 0-5 domain for the rating line.
                */}
                {showReplyRate ? (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey={(row: { avg_rating: number }) =>
                      row.avg_rating * 20
                    }
                    name="Nota média (×20)"
                    stroke={CHART_COLORS.amber}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ) : (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avg_rating"
                    name="Nota média"
                    stroke={CHART_COLORS.amber}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                )}
                {showReplyRate && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="reply_rate_pct"
                    name="Taxa de resposta (%)"
                    stroke={CHART_COLORS.gray}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Section 2: E-notariado vs. Outras                                 */}
      {/* ----------------------------------------------------------------- */}
      {(() => {
        const hasEnotariado = chartData.some((d) => d.reviews_enotariado > 0)
        return hasEnotariado ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Avaliações E-notariado vs. Outras
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trends.isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : trends.isError ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Não foi possível carregar o gráfico.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<PremiumTooltip />} />
                    <Legend />
                    <Bar
                      dataKey="reviews_enotariado"
                      name="E-notariado"
                      stackId="stack"
                      fill={CHART_COLORS.green}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="other_reviews"
                      name="Outras"
                      stackId="stack"
                      fill={CHART_COLORS.gray}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        ) : !trends.isLoading ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-sm text-muted-foreground">
                A classificação E-notariado será exibida após a execução do
                classificador automático.
              </p>
            </CardContent>
          </Card>
        ) : null
      })()}

      {/* ----------------------------------------------------------------- */}
      {/* Section 3: Desempenho dos Colaboradores + comparativo (AC-3.7.11) */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Desempenho dos Colaboradores
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              checked={includeInactive}
              onCheckedChange={(val) =>
                startTransition(() => setIncludeInactive(val))
              }
            />
            <span
              className="text-sm font-medium select-none cursor-pointer"
              onClick={() =>
                startTransition(() => setIncludeInactive((v) => !v))
              }
            >
              Incluir inativos
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/*
            Comparison chart — visible only when ≥2 collaborators are selected.
            Sits above the table so picking rows immediately reveals the overlay.
          */}
          {showCompareChart && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Comparativo de colaboradores selecionados
                </h3>
                <span className="text-xs text-muted-foreground">
                  {selectedCollaborators.length}/{MAX_COMPARE} selecionados
                </span>
              </div>
              <CollaboratorCompareChart
                collaborators={selectedCollaborators}
              />
            </div>
          )}

          {collaborators.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : collaborators.isError ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Não foi possível carregar os dados de colaboradores.
            </p>
          ) : !collaborators.data?.collaborators.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum colaborador encontrado para o período selecionado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" aria-label="Selecionar" />
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead
                    className="cursor-help"
                    title="Quantidade de vezes que o colaborador foi citado nas avaliações"
                  >
                    <span className="inline-flex items-center gap-1">
                      Menções
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  </TableHead>
                  <TableHead>Nota Média</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collaborators.data.collaborators.map((c, idx) => {
                  const checked = selectedIds.includes(c.collaborator_id)
                  const selectionFull =
                    selectedIds.length >= MAX_COMPARE && !checked
                  return (
                    <TableRow
                      key={c.collaborator_id}
                      className={cn(checked && 'bg-muted/40')}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${toTitleCase(c.full_name)} para comparação`}
                          className="h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                          checked={checked}
                          disabled={selectionFull}
                          onChange={() => toggleCompareId(c.collaborator_id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          to={`/collaborators/${c.collaborator_id}`}
                          className="text-foreground hover:text-primary hover:underline"
                        >
                          {toTitleCase(c.full_name)}
                        </Link>
                      </TableCell>
                      <TableCell>{formatNumber(c.total_mentions)}</TableCell>
                      <TableCell>
                        {formatDecimal(c.avg_rating_mentioned)}
                      </TableCell>
                      <TableCell>
                        {c.is_active ? (
                          <Badge variant="default" className="bg-green-600">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
