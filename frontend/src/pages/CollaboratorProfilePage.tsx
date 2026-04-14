import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  MessageCircle,
  Star,
  TrendingUp,
  Trophy,
  UserX,
} from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useCollaboratorProfile } from '@/hooks/use-metrics'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DeltaBadge } from '@/components/ui/DeltaBadge'
import { RatingHistogram } from '@/components/charts/RatingHistogram'
import { CustomTooltip } from '@/components/charts/CustomTooltip'
import { CollaboratorReviewsTable } from '@/components/collaborators/CollaboratorReviewsTable'

import { CHART_COLORS } from '@/lib/chart-config'
import { MONTHS_PT, formatDecimal, formatNumber, toTitleCase } from '@/lib/format'
import type { CollaboratorMonthData } from '@/types/metrics'

// ---------------------------------------------------------------------------
// Helpers — hoisted to module scope so we don't recreate them on every render.
// ---------------------------------------------------------------------------

function formatMonth(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${MONTHS_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`
}

function parseCollaboratorId(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n) || n <= 0) return null
  return n
}

/**
 * Growth of the last month vs. historical mean of previous months.
 * Returns a percent value (e.g. `+12.5` for 12.5% growth), or `null`
 * when there is insufficient data to compute a meaningful ratio.
 */
function computeLastMonthGrowth(monthly: CollaboratorMonthData[]): number | null {
  if (monthly.length < 2) return null
  const last = monthly[monthly.length - 1]
  const previous = monthly.slice(0, -1)
  if (!last || previous.length === 0) return null

  const historicalMean =
    previous.reduce((sum, m) => sum + m.mentions, 0) / previous.length

  if (historicalMean <= 0) {
    // Historical baseline is zero: any positive value is "infinite" growth.
    // Represent as null so DeltaBadge renders "Estável" instead of a
    // misleading +∞.
    return last.mentions > 0 ? null : 0
  }

  return ((last.mentions - historicalMean) / historicalMean) * 100
}

// ---------------------------------------------------------------------------
// Skeleton + error states
// ---------------------------------------------------------------------------

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-48" />
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  )
}

function NotFoundState({ message }: { message: string }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-16 text-center">
          <UserX
            className="mx-auto mb-4 size-12 text-muted-foreground/40"
            aria-hidden
          />
          <h2 className="text-lg font-semibold">Colaborador não encontrado</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {message}
          </p>
          <Link
            to="/analytics"
            className={buttonVariants({ variant: 'outline', className: 'mt-6' })}
          >
            <ArrowLeft className="mr-1 size-4" aria-hidden />
            Voltar para Analytics
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small KPI card — local atom, mirrors DashboardPage visual language.
// ---------------------------------------------------------------------------

interface KpiCardProps {
  title: string
  value: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  children?: React.ReactNode
  hint?: string
}

function KpiCard({ title, value, icon: Icon, children, hint }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        {children && <div className="mt-1">{children}</div>}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CollaboratorProfilePage() {
  const params = useParams<{ id: string }>()
  const collaboratorId = parseCollaboratorId(params.id)
  const query = useCollaboratorProfile(collaboratorId)

  // Derived values — all memoized as primitives or small objects so that
  // DeltaBadge / child components don't re-render on unrelated state.
  const deltas = useMemo(() => {
    const data = query.data
    if (!data) {
      return {
        mentionsDelta: null as number | null,
        ratingDelta: null as number | null,
        growthPct: null as number | null,
      }
    }

    const mentionsDelta =
      data.mentions_last_6m - (data.mentions_prev_6m ?? 0)

    const ratingDelta =
      data.avg_rating_last_6m != null && data.avg_rating_prev_6m != null
        ? data.avg_rating_last_6m - data.avg_rating_prev_6m
        : null

    const growthPct = computeLastMonthGrowth(data.monthly ?? [])

    return { mentionsDelta, ratingDelta, growthPct }
  }, [query.data])

  const monthlyChart = useMemo(() => {
    const monthly = query.data?.monthly ?? []
    return monthly.map((m) => ({
      name: formatMonth(m.month),
      Menções: m.mentions,
      'Nota Média': m.avg_rating ?? 0,
    }))
  }, [query.data?.monthly])

  // ---------------- loading ----------------
  if (collaboratorId == null) {
    return (
      <NotFoundState message="O identificador informado não é um número válido." />
    )
  }

  if (query.isLoading) {
    return <ProfileSkeleton />
  }

  // ---------------- 404 ----------------
  if (query.isError || !query.data) {
    const status = (query.error as { status?: number } | undefined)?.status
    const message =
      status === 404
        ? 'Este colaborador não existe ou foi removido do sistema.'
        : 'Não foi possível carregar o perfil. Tente novamente em instantes.'
    return <NotFoundState message={message} />
  }

  const data = query.data
  const displayName = toTitleCase(data.full_name)
  const hasMonthlySeries = monthlyChart.length >= 2

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Link
          to="/analytics"
          className="transition-colors hover:text-foreground"
        >
          Colaboradores
        </Link>
        <span aria-hidden>/</span>
        <span className="font-medium text-foreground">{displayName}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {data.department && <span>{data.department}</span>}
            {data.department && data.position && (
              <span aria-hidden className="text-muted-foreground/40">
                •
              </span>
            )}
            {data.position && <span>{data.position}</span>}
          </p>
        </div>
        <Badge
          variant={data.is_active ? 'secondary' : 'outline'}
          className={
            data.is_active
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
              : 'text-muted-foreground'
          }
        >
          {data.is_active ? 'Ativo' : 'Inativo'}
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Total de menções"
          value={formatNumber(data.total_mentions)}
          icon={MessageCircle}
        >
          <DeltaBadge value={deltas.mentionsDelta} decimals={0} />
        </KpiCard>

        <KpiCard
          title="Nota média"
          value={data.avg_rating != null ? formatDecimal(data.avg_rating) : '—'}
          icon={Star}
        >
          <DeltaBadge value={deltas.ratingDelta} decimals={2} />
        </KpiCard>

        <KpiCard
          title="Ranking"
          value={
            data.ranking != null
              ? `#${data.ranking}`
              : '—'
          }
          icon={Trophy}
          hint={
            data.ranking != null
              ? `de ${formatNumber(data.total_collaborators_active)} colaboradores ativos`
              : 'sem posicionamento'
          }
        />

        <KpiCard
          title="Crescimento"
          value={
            deltas.growthPct != null
              ? `${deltas.growthPct >= 0 ? '+' : '\u2212'}${formatDecimal(Math.abs(deltas.growthPct), 1)}%`
              : '—'
          }
          icon={TrendingUp}
          hint="último mês vs. média histórica"
        />
      </div>

      {/* Grid: distribution + monthly evolution */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Distribution */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Distribuição de notas</CardTitle>
            <CardDescription>
              Reviews que mencionam {displayName.split(' ')[0] ?? displayName}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.total_mentions > 0 ? (
              <RatingHistogram
                distribution={data.rating_distribution}
                total={data.total_mentions}
              />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sem menções para calcular a distribuição.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Monthly evolution */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Evolução mensal</CardTitle>
            <CardDescription>
              Últimos 12 meses — menções e nota média
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasMonthlySeries ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={monthlyChart}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_COLORS.gridLine}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 5]}
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    yAxisId="left"
                    dataKey="Menções"
                    fill={CHART_COLORS.blue}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="Nota Média"
                    stroke={CHART_COLORS.amber}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <BarChart3
                  className="size-8 text-muted-foreground/40"
                  aria-hidden
                />
                Sem dados suficientes para exibir evolução.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent reviews */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Avaliações que mencionam este colaborador
          </CardTitle>
          <CardDescription>
            Últimas {data.recent_reviews.length} avaliações com menção
            identificada
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CollaboratorReviewsTable reviews={data.recent_reviews} />
        </CardContent>
      </Card>
    </div>
  )
}
