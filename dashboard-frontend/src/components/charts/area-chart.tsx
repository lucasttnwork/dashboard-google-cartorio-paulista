"use client"

import {
  AreaChart as RArea,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface DataPoint {
  date: string
  reviews: number
  rating: number
}

interface AreaChartProps {
  data: DataPoint[]
  title?: string
  height?: number
}

export function AreaChart({
  data,
  title = "Evolução de Avaliações",
  height = 280
}: AreaChartProps) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="reviews" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="reviews">Avaliações</TabsTrigger>
            <TabsTrigger value="rating">Rating Médio</TabsTrigger>
          </TabsList>

          <TabsContent value="reviews" className="mt-4">
            <div style={{ height: `${height}px` }}>
              <ResponsiveContainer width="100%" height="100%">
                <RArea
                  data={data}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fill-silver" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="white" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="white" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeOpacity={0.10} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsla(0,0%,100%,0.45)' }}
                  />
                  <YAxis hide />
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
                  <Area
                    type="monotone"
                    dataKey="reviews"
                    stroke={`hsl(var(--chart-1))`}
                    strokeWidth={2}
                    fill="url(#fill-silver)"
                  />
                </RArea>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="rating" className="mt-4">
            <div style={{ height: `${height}px` }}>
              <ResponsiveContainer width="100%" height="100%">
                <RArea
                  data={data}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fill-silver-2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="white" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="white" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeOpacity={0.10} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsla(0,0%,100%,0.45)' }}
                  />
                  <YAxis domain={[0, 5]} hide />
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
                  <Area
                    type="monotone"
                    dataKey="rating"
                    stroke="rgba(255,255,255,0.35)"
                    strokeWidth={2}
                    fill="rgba(255,255,255,0.12)"
                  />
                </RArea>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
