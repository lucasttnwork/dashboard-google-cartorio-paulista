import { supabase } from '@/lib/adapters/supabase'

// Tipos para o dashboard
export interface Review {
  review_id: string
  location_id: string
  rating: number | null
  comment: string | null
  reviewer_name: string | null
  create_time: string | null
  update_time: string | null
  reply_text: string | null
  reply_time: string | null
  collection_source: string
}

export interface Collaborator {
  id: number
  full_name: string
  department: string
  position: string
  is_active: boolean
}

export interface ReviewStats {
  location_id: string
  name: string
  current_rating: number
  total_reviews_count: number
  collection_runs_count: number
  last_collection_at: string
  is_monitoring_active: boolean
}

export interface MonthlyTrend {
  month: string
  year: number
  total_reviews: number
  avg_rating: number
  positive_reviews: number
  negative_reviews: number
}

// Funções de API
export const api = {
  async getReviewStats(): Promise<ReviewStats[]> {
    if (!supabase) {
      return [
        {
          location_id: 'mock',
          name: 'Cartório Paulista',
          current_rating: 4.9,
          total_reviews_count: 8537,
          collection_runs_count: 128,
          last_collection_at: new Date().toISOString(),
          is_monitoring_active: true,
        },
      ]
    }
    try {
      const { data, error } = await supabase.rpc('get_reviews_stats')
      if (error) throw error
      return data || []
    } catch {
      // fallback básico
      const { data } = await supabase.from('reviews').select('rating').limit(1000)
      const total = data?.length || 0
      const avg = total ? (data!.reduce((s: number, r: { rating?: number }) => s + (r.rating || 0), 0) / total) : 0
      return [
        {
          location_id: 'unknown',
          name: 'Local',
          current_rating: avg,
          total_reviews_count: total,
          collection_runs_count: 0,
          last_collection_at: new Date().toISOString(),
          is_monitoring_active: false,
        },
      ]
    }
  },

  async getRecentReviews(limit: number = 10): Promise<Review[]> {
    if (!supabase) {
      return Array.from({ length: limit }).map((_, i) => ({
        review_id: `mock-${i}`,
        location_id: 'mock',
        rating: 5,
        comment: 'Atendimento excelente e rápido!',
        reviewer_name: 'Usuário Google',
        create_time: new Date(Date.now() - i * 86400000).toISOString(),
        update_time: null,
        reply_text: null,
        reply_time: null,
        collection_source: 'mock',
      }))
    }
    try {
      const { data, error } = await supabase.rpc('get_recent_reviews', { limit_param: limit })
      if (error) throw error
      return data || []
    } catch {
      const { data } = await supabase
        .from('reviews')
        .select('*')
        .order('create_time', { ascending: false })
        .limit(limit)
      return data || []
    }
  },

  async getMonthlyTrends(): Promise<MonthlyTrend[]> {
    if (!supabase) {
      const now = new Date()
      return Array.from({ length: 6 }).map((_, idx) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1)
        return {
          month: String(d.getMonth() + 1).padStart(2, '0'),
          year: d.getFullYear(),
          total_reviews: 60 + Math.floor(Math.random() * 30),
          avg_rating: 4.6 + Math.random() * 0.4,
          positive_reviews: 50 + Math.floor(Math.random() * 20),
          negative_reviews: 2 + Math.floor(Math.random() * 5),
        }
      })
    }
    try {
      const { data, error } = await supabase.rpc('get_monthly_trends')
      if (error) throw error
      return data || []
    } catch {
      // fallback simples: retorna vazio
      return []
    }
  },

  async getCollaborators(): Promise<Collaborator[]> {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('collaborators')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
    if (error) throw error
    return data || []
  },
}
