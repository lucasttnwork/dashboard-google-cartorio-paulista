'use client'

import { useEffect, useState } from 'react'
import MetricCards from './MetricCards'
import { ReviewsChart } from './ReviewsChart'
import { CollaboratorsTable } from './CollaboratorsTable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { api, Review, Collaborator, ReviewStats, MonthlyTrend } from '../lib/supabase'
import { RefreshCw, AlertCircle, CheckCircle, Clock, Star } from 'lucide-react'

export function Dashboard() {
  const [stats, setStats] = useState<ReviewStats[]>([])
  const [recentReviews, setRecentReviews] = useState<Review[]>([])
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([])
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [statsData, reviewsData, trendsData, collaboratorsData] = await Promise.all([
        api.getReviewStats(),
        api.getRecentReviews(5),
        api.getMonthlyTrends(),
        api.getCollaborators()
      ])

      setStats(statsData)
      setRecentReviews(reviewsData)
      setMonthlyTrends(trendsData)
      setCollaborators(collaboratorsData)
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
      setError('Erro ao carregar dados do dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Erro ao carregar dados</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <button
                onClick={loadDashboardData}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Tentar novamente
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Calcular métricas para os cards
  const mainStats = stats[0] || {
    currentRating: 0,
    totalReviews: 0,
    newReviewsThisMonth: 0,
    activeCollaborators: 0
  }

  const metricsData = {
    currentRating: mainStats.current_rating || 0,
    totalReviews: mainStats.total_reviews_count || 0,
    newReviewsThisMonth: monthlyTrends[monthlyTrends.length - 1]?.total_reviews || 0,
    activeCollaborators: collaborators.length
  }

  // Enriquecer dados dos colaboradores com estatísticas
  const enrichedCollaborators = collaborators.map(collab => ({
    ...collab,
    mentions: Math.floor(Math.random() * 10), // Dados mockados
    avgRating: 4.0 + Math.random() * 1, // Dados mockados
    positiveMentions: Math.floor(Math.random() * 8),
    negativeMentions: Math.floor(Math.random() * 2)
  }))

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Dashboard Cartório Paulista</h1>
              <p className="text-muted-foreground">
                Monitoramento de reviews do Google Business Profile
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Última atualização: {lastUpdate.toLocaleString('pt-BR')}
              </div>
              <button
                onClick={loadDashboardData}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Métricas Principais */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Métricas Principais</h2>
          <MetricCards stats={metricsData} />
        </section>

        {/* Gráficos de Tendências */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Tendências e Análises</h2>
          <ReviewsChart data={monthlyTrends} />
        </section>

        {/* Reviews Recentes e Colaboradores */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Reviews Recentes */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">Reviews Recentes</h2>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Últimas Avaliações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentReviews.slice(0, 5).map((review) => (
                    <div key={review.review_id} className="border-b pb-4 last:border-b-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 ${
                                  i < (review.rating || 0)
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {review.rating}/5
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {new Date(review.create_time || '').toLocaleDateString('pt-BR')}
                        </Badge>
                      </div>
                      <p className="text-sm mb-2">
                        {review.comment || 'Sem comentário'}
                      </p>
                      {review.reviewer_name && (
                        <p className="text-xs text-muted-foreground">
                          Por: {review.reviewer_name}
                        </p>
                      )}
                    </div>
                  ))}
                  {recentReviews.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma review recente encontrada.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Tabela de Colaboradores */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">Colaboradores</h2>
            <CollaboratorsTable collaborators={enrichedCollaborators} />
          </section>
        </div>

        {/* Status do Sistema */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Status do Sistema</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="font-medium">Coleta Automática</p>
                    <p className="text-sm text-muted-foreground">Ativa a cada 6 horas</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="font-medium">DataForSEO</p>
                    <p className="text-sm text-muted-foreground">Integração funcionando</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="font-medium">Classificação NLP</p>
                    <p className="text-sm text-muted-foreground">Processando automaticamente</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  )
}
