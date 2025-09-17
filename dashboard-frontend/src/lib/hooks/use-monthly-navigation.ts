import { useState, useEffect } from 'react'
import { fetchAvailableMonths, fetchReviewsByMonth, fetchMonthlyStats, fetchMonthlyTrends } from '@/lib/adapters/supabase'

interface UseMonthlyNavigationOptions {
  initialMonth?: string
  limit?: number
}

interface MonthlyNavigationState {
  availableMonths: string[]
  currentMonth: string | null
  reviews: any[]
  stats: any
  isLoading: boolean
  error: string | null
}

export function useMonthlyNavigation(options: UseMonthlyNavigationOptions = {}) {
  const { initialMonth, limit = 1000 } = options

  const [state, setState] = useState<MonthlyNavigationState>({
    availableMonths: [],
    currentMonth: initialMonth || null,
    reviews: [],
    stats: null,
    isLoading: true,
    error: null
  })

  // Carregar meses disponíveis
  useEffect(() => {
    const loadAvailableMonths = async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }))
        // Meses via tendências mensais (sempre usar esta fonte)
        const trends = await fetchMonthlyTrends()
        const uniq = new Set<string>()
        trends.forEach((t: any) => {
          const m = String(t.month || '').substring(0, 7)
          if (/^\d{4}-\d{2}$/.test(m)) uniq.add(m)
        })
        const months: string[] = Array.from(uniq).sort().reverse()

        setState(prev => ({
          ...prev,
          availableMonths: months,
          currentMonth: prev.currentMonth || months[0] || null,
          isLoading: false
        }))
      } catch (error) {
        console.error('Erro ao carregar meses disponíveis:', error)
        setState(prev => ({
          ...prev,
          error: 'Erro ao carregar meses disponíveis',
          isLoading: false
        }))
      }
    }

    loadAvailableMonths()
  }, [])

  // Carregar dados do mês atual
  useEffect(() => {
    const loadMonthData = async () => {
      if (!state.currentMonth) return

      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }))

        // Carregar reviews e estatísticas em paralelo
        const [reviews, stats] = await Promise.all([
          fetchReviewsByMonth(state.currentMonth, limit),
          fetchMonthlyStats(state.currentMonth)
        ])

        setState(prev => ({
          ...prev,
          reviews,
          stats,
          isLoading: false
        }))
      } catch (error) {
        console.error('Erro ao carregar dados do mês:', error)
        setState(prev => ({
          ...prev,
          error: 'Erro ao carregar dados do mês',
          isLoading: false
        }))
      }
    }

    if (state.availableMonths.length > 0) {
      loadMonthData()
    }
  }, [state.currentMonth, state.availableMonths.length, limit])

  const changeMonth = (month: string) => {
    if (state.availableMonths.includes(month)) {
      setState(prev => ({ ...prev, currentMonth: month }))
    }
  }

  const goToNextMonth = () => {
    const currentIndex = state.availableMonths.findIndex(m => m === state.currentMonth)
    if (currentIndex >= 0 && currentIndex < state.availableMonths.length - 1) {
      const nextMonth = state.availableMonths[currentIndex + 1]
      changeMonth(nextMonth)
    }
  }

  const goToPreviousMonth = () => {
    const currentIndex = state.availableMonths.findIndex(m => m === state.currentMonth)
    if (currentIndex > 0) {
      const prevMonth = state.availableMonths[currentIndex - 1]
      changeMonth(prevMonth)
    }
  }

  const refreshData = async () => {
    if (!state.currentMonth) return

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }))

      const [reviews, stats] = await Promise.all([
        fetchReviewsByMonth(state.currentMonth, limit),
        fetchMonthlyStats(state.currentMonth)
      ])

      setState(prev => ({
        ...prev,
        reviews,
        stats,
        isLoading: false
      }))
    } catch (error) {
      console.error('Erro ao atualizar dados:', error)
      setState(prev => ({
        ...prev,
        error: 'Erro ao atualizar dados',
        isLoading: false
      }))
    }
  }

  return {
    // Estado
    availableMonths: state.availableMonths,
    currentMonth: state.currentMonth,
    reviews: state.reviews,
    stats: state.stats,
    isLoading: state.isLoading,
    error: state.error,

    // Ações
    changeMonth,
    goToNextMonth,
    goToPreviousMonth,
    refreshData,

    // Utilitários
    hasNextMonth: state.availableMonths.findIndex(m => m === state.currentMonth) < state.availableMonths.length - 1,
    hasPreviousMonth: state.availableMonths.findIndex(m => m === state.currentMonth) > 0
  }
}
