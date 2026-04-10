import { useState } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'
import { TrendingUp, Users, BarChart3, Info } from 'lucide-react'
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
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTrends, useCollaboratorMentions } from '@/hooks/use-metrics'

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const MONTHS_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

function formatMonth(isoDate: string): string {
  const d = new Date(isoDate)
  return `${MONTHS_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`
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
// Custom Tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card p-3 shadow-md">
      <p className="mb-1 text-sm font-medium">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} className="text-sm" style={{ color: entry.color }}>
          {entry.name}:{' '}
          {typeof entry.value === 'number'
            ? formatDecimal(entry.value)
            : entry.value}
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Period options
// ---------------------------------------------------------------------------

const PERIOD_OPTIONS = [
  { value: '6', label: 'Últimos 6 meses' },
  { value: '12', label: 'Últimos 12 meses' },
  { value: '24', label: 'Últimos 24 meses' },
  { value: '60', label: 'Todo o período' },
] as const

// ---------------------------------------------------------------------------
// AnalyticsPage
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [months, setMonths] = useState(12)
  const [includeInactive, setIncludeInactive] = useState(false)

  const trends = useTrends({ months })
  const collaborators = useCollaboratorMentions({
    months,
    include_inactive: includeInactive,
  })

  // Prepare chart data with formatted month labels
  const chartData =
    trends.data?.months.map((m) => ({
      ...m,
      label: formatMonth(m.month),
      other_reviews: m.total_reviews - m.reviews_enotariado,
    })) ?? []

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Page header + period selector                                      */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Análises</h1>
          <p className="text-muted-foreground">
            Tendências e desempenho detalhado
          </p>
        </div>

        <Select
          value={String(months)}
          onValueChange={(v) => setMonths(Number(v))}
        >
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

      {/* ----------------------------------------------------------------- */}
      {/* Section 1: Tendência da Nota Média                                */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Tendência da Nota Média
          </CardTitle>
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
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                    style: { fontSize: 12, fill: 'var(--color-muted-foreground)' },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 5]}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  label={{
                    value: 'Nota',
                    angle: 90,
                    position: 'insideRight',
                    style: { fontSize: 12, fill: 'var(--color-muted-foreground)' },
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar
                  yAxisId="left"
                  dataKey="total_reviews"
                  name="Avaliações"
                  fill="hsl(210 80% 65%)"
                  radius={[4, 4, 0, 0]}
                  opacity={0.7}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avg_rating"
                  name="Nota média"
                  stroke="hsl(35 95% 55%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Section 2: E-notariado vs. Outras                                 */}
      {/* ----------------------------------------------------------------- */}
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
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar
                  dataKey="reviews_enotariado"
                  name="E-notariado"
                  stackId="stack"
                  fill="hsl(150 60% 45%)"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="other_reviews"
                  name="Outras"
                  stackId="stack"
                  fill="hsl(220 10% 70%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Section 3: Desempenho dos Colaboradores                           */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Desempenho dos Colaboradores
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              id="include-inactive"
              checked={includeInactive}
              onCheckedChange={setIncludeInactive}
            />
            <Label htmlFor="include-inactive" className="text-sm">
              Incluir inativos
            </Label>
          </div>
        </CardHeader>
        <CardContent>
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
                {collaborators.data.collaborators.map((c, idx) => (
                  <TableRow key={c.collaborator_id}>
                    <TableCell className="font-medium text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
