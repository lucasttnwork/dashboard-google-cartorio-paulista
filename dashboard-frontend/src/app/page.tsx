"use client"

import * as React from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { CardKPI } from '@/components/kpi/card-kpi'
import { AreaChart } from '@/components/charts/area-chart'
// import { DataTable } from '@/components/table/data-table'
import { type Review } from '@/components/table/reviews-columns'
import { PeriodFilter, type PeriodPreset } from '@/components/ui/period-filter'
import { useReviewsStats, useMockReviewsData } from '@/lib/hooks/use-reviews'
import { useMockTopCollaborators } from '@/lib/hooks/use-collaborators'
import { fetchReviewsStats, fetchCollaboratorMentions, fetchMonthlyTrends } from '@/lib/adapters/supabase'
import { Star, MessageSquare, TrendingUp, Users, Filter } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { DateRange } from 'react-day-picker'

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useReviewsStats()
  const { data: chartData } = useMockReviewsData()
  const { data: topCollaborators } = useMockTopCollaborators()
  const [selectedPeriod, setSelectedPeriod] = React.useState<PeriodPreset | DateRange>("30d")
  
  // Estados para dados reais
  const [realStats, setRealStats] = React.useState<any>(null)
  const [realCollaborators, setRealCollaborators] = React.useState<any[]>([])
  const [realTrends, setRealTrends] = React.useState<any[]>([])
  const [isLoadingReal, setIsLoadingReal] = React.useState(true)

  // Carregar dados reais do Supabase
  React.useEffect(() => {
    const loadRealData = async () => {
      try {
        setIsLoadingReal(true)
        console.log('🔄 Carregando dados reais para dashboard...')
        
        // Carregar em paralelo
        const [statsData, collaboratorsData, trendsData] = await Promise.all([
          fetchReviewsStats(),
          fetchCollaboratorMentions(),
          fetchMonthlyTrends()
        ])
        
        console.log('📊 Stats:', statsData)
        console.log('👥 Colaboradores:', collaboratorsData)
        console.log('📈 Tendências:', trendsData)
        
        setRealStats(statsData)
        setRealCollaborators(collaboratorsData)
        setRealTrends(trendsData)
      } catch (error) {
        console.error('❌ Erro ao carregar dados reais:', error)
        // Manter dados mock em caso de erro
      } finally {
        setIsLoadingReal(false)
      }
    }

    loadRealData()
  }, [])

  // Dados mock para a tabela (até termos dados reais)
  const mockReviews: Review[] = []

  // Usar dados reais se disponíveis, senão usar dados mock
  const currentStats = realStats || stats
  const currentCollaborators = realCollaborators.length > 0 ? realCollaborators : topCollaborators
  
  const totalReviews = currentStats?.total_reviews || 458
  const avgRating = currentStats?.avg_rating ? Number(currentStats.avg_rating).toFixed(1) : "4.97"
  const oldestReview = currentStats?.oldest_review ? format(new Date(currentStats.oldest_review), "dd/MM/yyyy", { locale: ptBR }) : "02/08/2025"
  const newestReview = currentStats?.newest_review ? format(new Date(currentStats.newest_review), "dd/MM/yyyy", { locale: ptBR }) : "01/09/2025"
  const fiveStarPercentage = currentStats?.five_star_percentage ? Math.round(currentStats.five_star_percentage) : 97

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Visão geral das avaliações do Cartório Paulista
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Período:</span>
            </div>
            <PeriodFilter
              value={selectedPeriod}
              onChange={setSelectedPeriod}
            />
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <CardKPI
            title="Total de Avaliações"
            value={totalReviews.toString()}
            change={{
              value: 12.5,
              period: "este mês"
            }}
            icon={<MessageSquare className="h-4 w-4" />}
            hint={`De ${oldestReview} até ${newestReview}`}
          />

          <CardKPI
            title="Avaliação Média"
            value={`${avgRating}★`}
            change={{
              value: 2.1,
              period: "este mês"
            }}
            icon={<Star className="h-4 w-4" />}
            hint="Baseado em todas as avaliações"
          />

          <CardKPI
            title="Avaliações 5★"
            value={`${fiveStarPercentage}%`}
            change={{
              value: 1.8,
              period: "este mês"
            }}
            icon={<TrendingUp className="h-4 w-4" />}
            hint="Porcentagem de avaliações perfeitas"
          />

          <CardKPI
            title="Colaboradores Ativos"
            value="9"
            icon={<Users className="h-4 w-4" />}
            hint="Equipe do E-notariado"
          />
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-7">
          <div className="lg:col-span-4">
            {chartData && <AreaChart data={chartData} />}
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-2xl border bg-card p-6">
              <h3 className="text-lg font-semibold mb-4">Colaboradores Mais Mencionados</h3>
              <div className="space-y-4">
                {isLoadingReal && <p className="text-sm text-muted-foreground">Carregando dados reais...</p>}
                {currentCollaborators?.slice(0, 5).map((collaborator, index) => (
                  <div key={collaborator.full_name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{collaborator.full_name}</p>
                        <p className="text-xs text-muted-foreground">{collaborator.department}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-sm">{collaborator.mentions}</p>
                      <p className="text-xs text-muted-foreground">menções</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        {/* <div className="rounded-2xl border bg-card p-6">
          <h3 className="text-lg font-semibold mb-4">Avaliações Recentes</h3>
          <DataTable
            columns={reviewsColumns}
            data={mockReviews}
            tableId="reviews"
            searchPlaceholder="Buscar avaliações..."
            searchColumn="reviewer_name"
          />
        </div> */}
      </div>
    </AppShell>
  )
}
