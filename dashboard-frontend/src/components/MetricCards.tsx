'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Star, Users, TrendingUp, AlertTriangle } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string | number
  icon?: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
  description?: string
}

function MetricCard({ title, value, icon, trend, description }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs md:text-sm text-[hsl(var(--muted-foreground))]">{title}</CardTitle>
        <div className="text-[hsl(var(--muted-foreground))]">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-4xl md:text-5xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">{value}</div>
        {trend && (
          <p className={`text-xs mt-1 ${trend.isPositive ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--destructive))]'}`}>
            {trend.isPositive ? '+' : ''}{trend.value}% em relação ao mês anterior
          </p>
        )}
        {description && (
          <p className="text-xs text-[hsl(var(--subtle-foreground))] mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

interface MetricCardsProps {
  stats: {
    currentRating: number
    totalReviews: number
    newReviewsThisMonth: number
    activeCollaborators: number
  }
}

export default function MetricCards({ stats }: MetricCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Avaliação Média"
        value={stats.currentRating.toFixed(1)}
        icon={<Star className="h-4 w-4" />}
        description="Das últimas 100 avaliações"
      />
      <MetricCard
        title="Total de Reviews"
        value={stats.totalReviews.toLocaleString()}
        icon={<Users className="h-4 w-4" />}
        trend={{ value: 12.5, isPositive: true }}
      />
      <MetricCard
        title="Novos Reviews (Mês)"
        value={stats.newReviewsThisMonth}
        icon={<TrendingUp className="h-4 w-4" />}
        trend={{ value: 8.2, isPositive: true }}
      />
      <MetricCard
        title="Colaboradores Ativos"
        value={stats.activeCollaborators}
        icon={<AlertTriangle className="h-4 w-4" />}
        description="Monitorados no sistema"
      />
    </div>
  )
}
