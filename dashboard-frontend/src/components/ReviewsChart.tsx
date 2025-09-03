'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

interface MonthlyTrend {
  month: string
  year: number
  total_reviews: number
  avg_rating: number
  positive_reviews: number
  negative_reviews: number
}

interface ReviewsChartProps {
  data: MonthlyTrend[]
}

export function ReviewsChart({ data }: ReviewsChartProps) {
  // Formatar dados para o gráfico
  const chartData = data.map(item => ({
    month: `${item.month}/${item.year.toString().slice(-2)}`,
    total: item.total_reviews,
    rating: item.avg_rating,
    positive: item.positive_reviews,
    negative: item.negative_reviews
  }))

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Gráfico de Linha - Avaliação Média */}
      <Card>
        <CardHeader>
          <CardTitle>Tendência de Avaliação</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid vertical={false} strokeOpacity={0.10} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'hsla(0,0%,100%,0.45)' }} />
              <YAxis domain={[0, 5]} axisLine={false} tickLine={false} tick={{ fill: 'hsla(0,0%,100%,0.45)' }} />
              <Tooltip
                cursor={{ strokeOpacity: 0.1 }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Line
                type="monotone"
                dataKey="rating"
                stroke={`hsl(var(--chart-1))`}
                strokeWidth={2}
                dot={{ fill: 'white' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráfico de Barras - Volume de Reviews */}
      <Card>
        <CardHeader>
          <CardTitle>Volume de Reviews por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} strokeOpacity={0.10} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'hsla(0,0%,100%,0.45)' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsla(0,0%,100%,0.45)' }} />
              <Tooltip
                cursor={{ strokeOpacity: 0.1 }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Bar dataKey="total" fill={`hsl(var(--primary))`} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráfico de Sentimento */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Distribuição de Sentimento</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} strokeOpacity={0.10} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'hsla(0,0%,100%,0.45)' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsla(0,0%,100%,0.45)' }} />
              <Tooltip
                cursor={{ strokeOpacity: 0.1 }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Bar dataKey="positive" stackId="a" fill={`hsl(var(--success))`} name="positive" />
              <Bar dataKey="negative" stackId="a" fill={`hsl(var(--destructive))`} name="negative" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
