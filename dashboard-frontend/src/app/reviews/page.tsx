"use client"

import { AppShell } from '@/components/shell/app-shell'
import { DataTable } from '@/components/table/data-table'
import { reviewsColumns } from '@/components/table/reviews-columns'
import { FileText, Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { AdvancedFiltersComponent, type AdvancedFilters } from '@/components/ui/advanced-filters'
import { MonthlyNavigation } from '@/components/ui/monthly-navigation'
import { useMonthlyNavigation } from '@/lib/hooks/use-monthly-navigation'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Tipo para as avaliações
type LocalReview = {
  review_id: string
  rating: number
  comment: string
  reviewer_name: string
  create_time: string
  collection_source: string
}

// Dados mock para demonstração (fallback)
const mockReviews: LocalReview[] = [
  {
    review_id: "1",
    rating: 5,
    comment: "Excelente atendimento! A Ana Sophia foi muito atenciosa e resolveu meu problema rapidamente.",
    reviewer_name: "João Silva",
    create_time: "2025-09-01T10:30:00Z",
    collection_source: "google"
  },
  {
    review_id: "2",
    rating: 5,
    comment: "Serviço de e-notariado muito eficiente. Karen Figueiredo me orientou perfeitamente.",
    reviewer_name: "Maria Santos",
    create_time: "2025-08-31T14:20:00Z",
    collection_source: "google"
  },
  {
    review_id: "3",
    rating: 4,
    comment: "Bom atendimento, porém demorou um pouco para ser atendido.",
    reviewer_name: "Pedro Oliveira",
    create_time: "2025-08-30T09:15:00Z",
    collection_source: "google"
  },
  {
    review_id: "4",
    rating: 5,
    comment: "Equipe muito profissional. Recomendo o Cartório Paulista!",
    reviewer_name: "Ana Costa",
    create_time: "2025-08-29T16:45:00Z",
    collection_source: "google"
  },
  {
    review_id: "5",
    rating: 5,
    comment: "Atendimento rápido e eficiente. Letícia Andreza foi excelente!",
    reviewer_name: "Carlos Mendes",
    create_time: "2025-08-28T11:00:00Z",
    collection_source: "google"
  },
]

export default function ReviewsPage() {
  const [filters, setFilters] = useState<AdvancedFilters>({})
  const [isExporting, setIsExporting] = useState(false)

  // Hook para navegação mensal
  const {
    availableMonths,
    currentMonth,
    reviews: monthlyReviews,
    stats: monthlyStats,
    isLoading,
    error,
    changeMonth,
    refreshData
  } = useMonthlyNavigation()

  // Filtrar dados baseado nos filtros aplicados (aplicado aos dados mensais)
  const filteredReviews = useMemo(() => {
    // Usar dados mensais se disponíveis, senão usar mocks
    let filtered = [...(monthlyReviews.length > 0 ? monthlyReviews : mockReviews)]

    // Filtro por rating
    if (filters.rating && filters.rating.length > 0) {
      filtered = filtered.filter(review => filters.rating!.includes(review.rating))
    }

    // Filtro por fonte
    if (filters.source && filters.source.length > 0) {
      filtered = filtered.filter(review => filters.source!.includes(review.collection_source))
    }

    // Filtro por colaborador (busca no comentário)
    if (filters.collaborator && filters.collaborator.length > 0) {
      filtered = filtered.filter(review =>
        filters.collaborator!.some(collaborator =>
          review.comment.toLowerCase().includes(collaborator.toLowerCase())
        )
      )
    }

    return filtered
  }, [filters, monthlyReviews])

  // Calcular estatísticas baseadas nos dados filtrados
  const localStats = useMemo(() => {
    const total = filteredReviews.length
    const avgRating = total > 0
      ? (filteredReviews.reduce((sum, review) => sum + review.rating, 0) / total).toFixed(2)
      : "0.00"
    const fiveStarPercentage = total > 0
      ? ((filteredReviews.filter(review => review.rating === 5).length / total) * 100).toFixed(1)
      : "0.0"

    return { total, avgRating, fiveStarPercentage }
  }, [filteredReviews])

  const handleExport = async () => {
    setIsExporting(true)

    try {
      // Simular processamento
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Usar dados filtrados para export
      const dataToExport = filteredReviews.length > 0 ? filteredReviews : mockReviews

      // Converter dados para CSV
      const csvHeaders = ['ID da Avaliação', 'Avaliação', 'Comentário', 'Avaliador', 'Data', 'Fonte']
      const csvRows = dataToExport.map(review => [
        review.review_id,
        review.rating.toString(),
        `"${review.comment.replace(/"/g, '""')}"`, // Escapar aspas no comentário
        review.reviewer_name,
        new Date(review.create_time).toLocaleDateString('pt-BR'),
        review.collection_source
      ])

      // Criar conteúdo CSV
      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.join(','))
      ].join('\n')

      // Criar blob e link de download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')

      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob)
        const monthLabel = currentMonth ? `_${currentMonth}` : ''
        link.setAttribute('href', url)
        link.setAttribute('download', `avaliacoes_cartorio_paulista${monthLabel}_${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        toast.success(`Exportação concluída!`, {
          description: `${dataToExport.length} avaliações exportadas com sucesso.`,
          duration: 3000,
        })
      }
    } catch (error) {
      console.error('Erro ao exportar:', error)
      toast.error('Erro na exportação', {
        description: 'Tente novamente em alguns instantes.',
        duration: 4000,
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Avaliações</h1>
            <p className="text-muted-foreground">
              Gerenciar e analisar todas as avaliações recebidas por mês
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={refreshData}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <AdvancedFiltersComponent
              filters={filters}
              onFiltersChange={setFilters}
            />
            <Button onClick={handleExport} size="sm" disabled={isExporting}>
              {isExporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Exportar CSV
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Layout principal com navegação mensal e conteúdo */}
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Navegação mensal - Sidebar */}
          <div className="lg:col-span-1">
            <MonthlyNavigation
              availableMonths={availableMonths}
              currentMonth={currentMonth}
              onMonthChange={changeMonth}
              isLoading={isLoading}
            />
          </div>

          {/* Conteúdo principal */}
          <div className="lg:col-span-3 space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border bg-card p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{isLoading ? '...' : localStats.total}</p>
                    <p className="text-sm text-muted-foreground">
                      Avaliações {currentMonth ? `(${format(new Date(currentMonth + '-01'), 'MMM yyyy', { locale: ptBR })})` : ''}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border bg-card p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-yellow-400" />
                  <div>
                    <p className="text-2xl font-bold">{isLoading ? '...' : localStats.avgRating}</p>
                    <p className="text-sm text-muted-foreground">Rating Médio</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border bg-card p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-green-400" />
                  <div>
                    <p className="text-2xl font-bold">{isLoading ? '...' : localStats.fiveStarPercentage}%</p>
                    <p className="text-sm text-muted-foreground">Avaliações 5★</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Table */}
            <div className="rounded-2xl border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  Avaliações {currentMonth ? `- ${format(new Date(currentMonth + '-01'), 'MMMM yyyy', { locale: ptBR })}` : ''}
                </h3>
                {error && (
                  <p className="text-sm text-red-500">{error}</p>
                )}
              </div>
              <DataTable
                columns={reviewsColumns}
                data={filteredReviews}
                tableId="reviews-page"
                searchPlaceholder="Buscar por nome, comentário..."
              />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
