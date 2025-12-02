"use client"

import * as React from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { CardKPI } from '@/components/kpi/card-kpi'
import { AreaChart } from '@/components/charts/area-chart'
// import { DataTable } from '@/components/table/data-table'
import { type Review } from '@/components/table/reviews-columns'
import { PeriodFilter, type PeriodPreset } from '@/components/ui/period-filter'
import { useReviewsStats } from '@/lib/hooks/use-reviews'
import { fetchReviewsStats, fetchMonthlyTrends, fetchMonthlyStats, fetchActiveCollaboratorsCount, fetchCollaboratorMentionsByMonth, fetchDailyTrendsForMonth } from '@/lib/adapters/supabase'
import { Star, MessageSquare, TrendingUp, Users, Filter, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { DateRange } from 'react-day-picker'
import { useMonthlyNavigation } from '@/lib/hooks/use-monthly-navigation'

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useReviewsStats()
  // Removido uso de dados mock para evitar discrepâncias em produção
  const [selectedPeriod, setSelectedPeriod] = React.useState<PeriodPreset | DateRange>("30d")

  // Estados para dados reais
  const [realStats, setRealStats] = React.useState<any>(null)
  const [realCollaborators, setRealCollaborators] = React.useState<any[]>([])
  const [realTrends, setRealTrends] = React.useState<any[]>([])
  const [dailyTrends, setDailyTrends] = React.useState<any[]>([])
  const [isLoadingReal, setIsLoadingReal] = React.useState(true)
  const [activeCollabCount, setActiveCollabCount] = React.useState<number>(9)
  const [monthlyCollaborators, setMonthlyCollaborators] = React.useState<any[]>([])

  // Hook para navegação mensal (para estatísticas mensais)
  const {
    availableMonths,
    currentMonth,
    stats: monthlyStats,
    isLoading: monthlyLoading,
    changeMonth
  } = useMonthlyNavigation()

  // Carregar dados reais do Supabase
  React.useEffect(() => {
    const loadRealData = async () => {
      try {
        setIsLoadingReal(true)
        console.log('🔄 Carregando dados reais para dashboard...')
        
        // Carregar em paralelo
        const [statsData, trendsData, collabTotal] = await Promise.all([
          fetchReviewsStats(),
          fetchMonthlyTrends(),
          fetchActiveCollaboratorsCount()
        ])
        
        console.log('📊 Stats:', statsData)
        console.log('📈 Tendências:', trendsData)
        
        // Garantir objeto mesmo se a RPC retornar array com uma linha
        setRealStats(Array.isArray(statsData) ? (statsData[0] || null) : statsData)
        setRealTrends(trendsData)
        setActiveCollabCount(collabTotal)
      } catch (error) {
        console.error('❌ Erro ao carregar dados reais:', error)
        // Manter dados mock em caso de erro
      } finally {
        setIsLoadingReal(false)
      }
    }

    loadRealData()
  }, [])

  // Carregar dados mensais dependentes do mês selecionado
  React.useEffect(() => {
    const loadMonthSpecificData = async () => {
      if (!currentMonth) return
      try {
        const [daily, mentions] = await Promise.all([
          fetchDailyTrendsForMonth(currentMonth),
          fetchCollaboratorMentionsByMonth(currentMonth)
        ])
        setDailyTrends(daily)
        setMonthlyCollaborators(mentions)
      } catch (err) {
        console.error('Erro ao carregar dados do mês no dashboard:', err)
        setDailyTrends([])
        setMonthlyCollaborators([])
      }
    }
    loadMonthSpecificData()
  }, [currentMonth])

  // Garantir que um mês atual seja definido quando a lista de meses carregar
  React.useEffect(() => {
    if (!currentMonth && availableMonths && availableMonths.length > 0) {
      // Seleciona o mês mais recente
      changeMonth(availableMonths[0])
    }
  }, [availableMonths, currentMonth, changeMonth])

  // Dados para o gráfico a partir das tendências reais
  const areaData: Array<{ date: string; reviews: number; rating: number; ma7?: number }> = React.useMemo(() => {
    const base = (dailyTrends && dailyTrends.length > 0 ? dailyTrends : []).map((d: any) => ({
      date: d.day as string,
      reviews: Number(d.total_reviews || 0),
      rating: Number(d.avg_rating || 0),
    }))

    // calcular média móvel de 7 dias sobre reviews
    const values = base.map(p => p.reviews)
    const ma7: Array<number | undefined> = values.map((_, idx) => {
      const start = Math.max(0, idx - 6)
      const slice = values.slice(start, idx + 1)
      const count = slice.length
      const sum = slice.reduce((a, b) => a + b, 0)
      return count > 0 ? Number((sum / count).toFixed(2)) : undefined
    })

    return base.map((p, i) => (ma7[i] !== undefined ? { ...p, ma7: ma7[i] } : { ...p }))
  }, [dailyTrends])

  // Dados mock para a tabela (placeholder até termos tabela real)
  const mockReviews: Review[] = []

  // Usar dados reais se disponíveis; normalizar para objeto (algumas RPCs retornam array com 1 linha)
  const rawStats = realStats || stats
  const currentStats = Array.isArray(rawStats) ? (rawStats[0] || null) : rawStats
  const currentCollaborators = realCollaborators
  
  const totalReviews = currentStats?.total_reviews ?? 0
  const avgRating = currentStats?.avg_rating ? Number(currentStats.avg_rating).toFixed(1) : "0.0"
  const oldestReview = currentStats?.oldest_review ? format(new Date(currentStats.oldest_review), "dd/MM/yyyy", { locale: ptBR }) : "—"
  const newestReview = currentStats?.newest_review ? format(new Date(currentStats.newest_review), "dd/MM/yyyy", { locale: ptBR }) : "—"
  const fiveStarPercentage = currentStats?.five_star_percentage ? Math.round(currentStats.five_star_percentage) : 0

  // Estatísticas mensais
  const monthlyTotalReviews = monthlyStats?.total_reviews ?? 0
  const monthlyAvgRating = monthlyStats?.avg_rating ? Number(monthlyStats.avg_rating).toFixed(1) : "0.0"
  const monthlyFiveStarPercentage = monthlyStats?.five_star_percentage ? Math.round(monthlyStats.five_star_percentage) : 0
  const monthlyFiveStarCount = monthlyStats?.five_star_count ?? 0

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
              <span className="text-sm text-muted-foreground">Mês:</span>
            </div>
            <select
              data-testid="month-select"
              value={currentMonth || ''}
              onChange={(e) => changeMonth(e.target.value)}
              className="p-2 border rounded-md bg-background text-sm"
            >
              {(availableMonths || []).map((m) => (
                <option key={m} value={m}>{format(new Date(m + '-01T12:00:00Z'), 'MMMM yyyy', { locale: ptBR })}</option>
              ))}
            </select>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div data-testid="kpi-total">
            <CardKPI
              title="Total de Avaliações"
              value={(monthlyLoading ? '...' : monthlyTotalReviews.toString())}
              change={{
                value: 12.5,
                period: "este mês"
              }}
              icon={<MessageSquare className="h-4 w-4" />}
              hint={currentMonth ? format(new Date(currentMonth + '-01T12:00:00Z'), 'MMMM yyyy', { locale: ptBR }) : ''}
            />
          </div>

          <div data-testid="kpi-avg">
            <CardKPI
              title="Avaliação Média"
              value={`${monthlyAvgRating}★`}
              change={{
                value: 2.1,
                period: "este mês"
              }}
              icon={<Star className="h-4 w-4" />}
              hint="Baseado nas avaliações do mês"
            />
          </div>

          <div data-testid="kpi-five-star">
            <CardKPI
              title="Avaliações 5★"
              value={`${monthlyFiveStarPercentage}%`} 
              change={{
                value: 1.8,
                period: "este mês"
              }}
              icon={<TrendingUp className="h-4 w-4" />}
              hint="Porcentagem no mês selecionado"
            />
          </div>

          <div data-testid="kpi-collab-active">
            <CardKPI
              title="Colaboradores Ativos"
              value={String(activeCollabCount)}
              icon={<Users className="h-4 w-4" />}
              hint="Equipe do E-notariado"
            />
          </div>
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-7">
          <div className="lg:col-span-4">
            {areaData && areaData.length > 0 && <AreaChart data={areaData} />}
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-2xl border bg-card p-6" data-testid="collaborators-section">
              <h3 className="text-lg font-semibold mb-4">Colaboradores Mais Mencionados (mês)</h3>
              <div className="space-y-4" data-testid="collaborators-list">
                {(monthlyLoading || isLoadingReal) && <p className="text-sm text-muted-foreground">Carregando...</p>}
                {(!monthlyLoading && (monthlyCollaborators || []).length === 0) && (
                  <p className="text-sm text-muted-foreground">Nenhuma menção encontrada neste mês.</p>
                )}
                {(monthlyCollaborators || []).map((collaborator, index) => (
                  <div key={collaborator.full_name} className="flex items-center justify-between" data-testid="collaborator-item">
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
