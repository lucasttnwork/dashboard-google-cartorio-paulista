import { Star, TrendingUp, Trophy, UserCircle, Calendar } from 'lucide-react'
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

import { useMyPerformance, useCollaboratorMentions } from '@/hooks/use-metrics'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { toTitleCase, formatNumber, formatDecimal, MONTHS_PT } from '@/lib/format'
import { CHART_COLORS, ratingBorderClass } from '@/lib/chart-config'
import { CustomTooltip } from '@/components/charts/CustomTooltip'

function formatMonth(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`size-3.5 ${i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
        />
      ))}
    </div>
  )
}

export default function PerformancePage() {
  const perf = useMyPerformance()
  const allCollabs = useCollaboratorMentions({ months: 12 })

  if (perf.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  const data = perf.data

  // Not linked to a collaborator
  if (!data?.linked) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meu Desempenho</h1>
          <p className="text-muted-foreground">
            Acompanhe suas métricas pessoais
          </p>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <UserCircle className="mx-auto mb-4 size-12 text-muted-foreground/40" />
            <h2 className="text-lg font-semibold">
              Perfil não vinculado
            </h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              Seu perfil ainda não foi vinculado a um colaborador.
              Solicite ao administrador que faça a vinculação no painel
              de Colaboradores.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Linked — show performance
  const monthlyChart = (data.monthly ?? []).map((m) => ({
    name: formatMonth(m.month),
    Menções: m.mentions,
    'Nota Média': m.avg_rating ?? 0,
  }))

  const collabList = (allCollabs.data?.collaborators ?? [])
    .slice()
    .sort((a, b) => b.total_mentions - a.total_mentions)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meu Desempenho</h1>
        <p className="text-muted-foreground">
          Métricas pessoais de {toTitleCase(data.full_name ?? '')}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Menções
            </CardTitle>
            <UserCircle className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight">
              {formatNumber(data.total_mentions)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Nota Média
            </CardTitle>
            <Star className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight">
              {data.avg_rating != null ? formatDecimal(data.avg_rating) : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ranking
            </CardTitle>
            <Trophy className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight">
              {data.ranking != null
                ? `#${data.ranking} de ${data.total_collaborators}`
                : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Evolução Mensal
            </CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight">
              {monthlyChart.length > 0
                ? `${monthlyChart.at(-1)?.Menções ?? 0} menções`
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground">último mês</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Evolution Chart */}
      {monthlyChart.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Evolução Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickLine={false} />
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
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Comparativo entre colaboradores */}
      {collabList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Comparativo entre Colaboradores</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Menções</TableHead>
                  <TableHead className="text-right">Nota Média</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collabList.map((c, idx) => {
                  const isMe = c.collaborator_id === data.collaborator_id
                  return (
                    <TableRow
                      key={c.collaborator_id}
                      className={isMe ? 'bg-primary/5 font-semibold' : ''}
                    >
                      <TableCell className="text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        {toTitleCase(c.full_name)}
                        {isMe && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            Você
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(c.total_mentions)}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.avg_rating_mentioned != null
                          ? formatDecimal(c.avg_rating_mentioned)
                          : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent reviews mentioning this collaborator */}
      {data.recent_reviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Avaliações que me mencionam</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recent_reviews.map((r) => (
              <div
                key={r.review_id}
                className={`rounded-lg border border-l-4 p-3 ${ratingBorderClass(r.rating)}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Stars rating={r.rating ?? 0} />
                  <span className="text-xs text-muted-foreground">
                    <Calendar className="mr-1 inline size-3" />
                    {r.create_time
                      ? new Date(r.create_time).toLocaleDateString('pt-BR')
                      : '—'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.comment || 'Sem comentário'}
                </p>
                <p className="mt-1 text-xs font-medium">{r.reviewer_name}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
