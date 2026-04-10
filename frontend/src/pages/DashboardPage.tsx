import type { ComponentType } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Star,
  MessageSquare,
  TrendingUp,
  Award,
  Users,
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

import {
  useMetricsOverview,
  useTrends,
  useCollaboratorMentions,
} from '@/hooks/use-metrics'
import type { MetricsOverview } from '@/types/metrics'
import { toTitleCase } from '@/lib/format'
import { CHART_COLORS } from '@/lib/chart-config'
import { CustomTooltip as PremiumTooltip } from '@/components/charts/CustomTooltip'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ---------------------------------------------------------------------------
// Formatting helpers (Brazilian Portuguese locale)
// ---------------------------------------------------------------------------

const MONTHS_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
] as const

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

function formatDecimal(n: number, digits = 2): string {
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatPercent(n: number): string {
  return (
    n.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + '%'
  )
}

function formatMonth(isoDate: string): string {
  const d = new Date(isoDate)
  return `${MONTHS_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

interface KpiCardProps {
  title: string
  value: string
  icon: ComponentType<{ className?: string }>
  isLoading: boolean
  isError: boolean
  tooltip?: string
  muted?: boolean
}

function KpiCard({ title, value, icon: Icon, isLoading, isError, tooltip, muted }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div>
            <p className={`font-bold tracking-tight ${muted ? 'text-base text-muted-foreground' : 'text-2xl'}`}>
              {isError ? '\u2014' : value}
            </p>
            {tooltip && (
              <p className="mt-1 text-xs text-muted-foreground">{tooltip}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// KPI value extractors
// ---------------------------------------------------------------------------

function kpiValues(overview: MetricsOverview | undefined) {
  if (!overview) {
    return {
      total: '\u2014',
      avg: '\u2014',
      fiveStar: '\u2014',
      enotariado: '\u2014',
      enotariadoPending: false,
    }
  }

  const hasEnotariado = overview.total_enotariado > 0
  const enotariadoPct = hasEnotariado
    ? (overview.total_enotariado / overview.total_reviews) * 100
    : 0

  return {
    total: formatNumber(overview.total_reviews),
    avg: formatDecimal(overview.avg_rating),
    fiveStar: formatPercent(overview.five_star_pct),
    enotariado: hasEnotariado ? formatPercent(enotariadoPct) : 'Classificação pendente',
    enotariadoPending: !hasEnotariado,
  }
}

// ---------------------------------------------------------------------------
// Chart section
// ---------------------------------------------------------------------------

function ReviewsChart({
  data,
  isLoading,
}: {
  data: { month: string; total_reviews: number; avg_rating: number }[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Avaliações e Nota Média por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!data.length) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Avaliações e Nota Média por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-12 text-center text-muted-foreground">
            Não foi possível carregar o gráfico.
          </p>
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((d) => ({
    name: formatMonth(d.month),
    Avaliações: d.total_reviews,
    'Nota Média': d.avg_rating,
  }))

  return (
    <Card className="col-span-full lg:col-span-1">
      <CardHeader>
        <CardTitle>Avaliações por Mês</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 5]}
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
              tickLine={false}
            />
            <Tooltip content={<PremiumTooltip />} />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="Avaliações"
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
              activeDot={{ r: 5 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function RatingTrendChart({
  data,
  isLoading,
}: {
  data: { month: string; avg_rating: number }[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <Card className="col-span-full lg:col-span-1">
        <CardHeader>
          <CardTitle>Evolução da Nota Média</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!data.length) {
    return (
      <Card className="col-span-full lg:col-span-1">
        <CardHeader>
          <CardTitle>Evolução da Nota Média</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-12 text-center text-muted-foreground">
            Não foi possível carregar o gráfico.
          </p>
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((d) => ({
    name: formatMonth(d.month),
    'Nota Média': d.avg_rating,
  }))

  // D3: Dynamic Y-axis range based on actual data (not fixed 0-5)
  const ratings = data.map((d) => d.avg_rating).filter((r) => r > 0)
  const minRating = ratings.length > 0 ? Math.min(...ratings) : 0
  const yMin = Math.max(0, Math.floor((minRating - 0.3) * 10) / 10)

  return (
    <Card className="col-span-full lg:col-span-1">
      <CardHeader>
        <CardTitle>Evolução da Nota Média</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
              tickLine={false}
            />
            <YAxis
              domain={[yMin, 5]}
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
              tickLine={false}
            />
            <Tooltip content={<PremiumTooltip />} />
            <Line
              type="monotone"
              dataKey="Nota Média"
              stroke={CHART_COLORS.amber}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Collaborators mini-table
// ---------------------------------------------------------------------------

function CollaboratorsTable({
  isLoading,
  collaborators,
}: {
  isLoading: boolean
  collaborators: { full_name: string; total_mentions: number; avg_rating_mentioned: number | null }[]
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <CardTitle>Colaboradores Mais Mencionados</CardTitle>
        </div>
        <Link
          to="/analytics"
          className="text-sm text-primary hover:underline"
        >
          Ver todas as análises &rarr;
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : collaborators.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            Nenhum colaborador encontrado.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Menções</TableHead>
                <TableHead className="text-right">Nota Média</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collaborators.map((c) => (
                <TableRow key={c.full_name}>
                  <TableCell className="font-medium">{toTitleCase(c.full_name)}</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(c.total_mentions)}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.avg_rating_mentioned != null
                      ? formatDecimal(c.avg_rating_mentioned)
                      : '\u2014'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

const PERIOD_OPTIONS = [
  { value: '3', label: 'Últimos 3 meses' },
  { value: '6', label: 'Últimos 6 meses' },
  { value: '12', label: 'Últimos 12 meses' },
  { value: '60', label: 'Todo o período' },
] as const

function periodToDates(months: number): { date_from?: string; date_to?: string } {
  if (months >= 60) return {}
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - months, 1)
  return { date_from: from.toISOString().slice(0, 10) }
}

export default function DashboardPage() {
  const [months, setMonths] = useState(12)
  const dateParams = useMemo(() => periodToDates(months), [months])

  const overview = useMetricsOverview(dateParams)
  const trends = useTrends({ months })
  const mentions = useCollaboratorMentions({ months })

  // Error toast — fires once when overview fails
  useEffect(() => {
    if (overview.isError) {
      toast.error('Não foi possível carregar os dados. Tente novamente.')
    }
  }, [overview.isError])

  const kpi = kpiValues(overview.data)

  const trendsData = trends.data?.months ?? []

  const topCollaborators = (mentions.data?.collaborators ?? [])
    .slice()
    .sort((a, b) => b.total_mentions - a.total_mentions)
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel Geral</h1>
          <p className="text-muted-foreground">
            Visão geral das avaliações do Cartório Paulista
          </p>
        </div>
        <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <SelectTrigger className="w-[200px]">
            <span>
              {PERIOD_OPTIONS.find((o) => o.value === String(months))?.label ?? 'Últimos 12 meses'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Total de Avaliações"
          value={kpi.total}
          icon={Star}
          isLoading={overview.isLoading}
          isError={overview.isError}
        />
        <KpiCard
          title="Nota Média"
          value={kpi.avg}
          icon={TrendingUp}
          isLoading={overview.isLoading}
          isError={overview.isError}
        />
        <KpiCard
          title="Avaliações 5 Estrelas"
          value={kpi.fiveStar}
          icon={Award}
          isLoading={overview.isLoading}
          isError={overview.isError}
        />
        <KpiCard
          title="Avaliações E-notariado"
          value={kpi.enotariado}
          icon={MessageSquare}
          isLoading={overview.isLoading}
          isError={overview.isError}
          muted={kpi.enotariadoPending}
          tooltip={kpi.enotariadoPending ? 'O classificador automático ainda não foi executado.' : undefined}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReviewsChart data={trendsData} isLoading={trends.isLoading} />
        <RatingTrendChart data={trendsData} isLoading={trends.isLoading} />
      </div>

      {/* Top collaborators */}
      <CollaboratorsTable
        isLoading={mentions.isLoading}
        collaborators={topCollaborators}
      />
    </div>
  )
}
