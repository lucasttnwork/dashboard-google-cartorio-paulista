import { createClient, SupabaseClient } from '@supabase/supabase-js'

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const envAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

const looksLikeHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value)
const isPlaceholder = (value: string): boolean => {
  const trimmed = (value || "").trim()
  if (!trimmed) return true
  const lower = trimmed.toLowerCase()
  return (
    lower.includes('your_supabase_url') ||
    lower.includes('your-supabase-url') ||
    lower.includes('project-ref.supabase.co') ||
    lower === 'your_supabase_anon_key' ||
    lower === 'anon-key' ||
    lower === 'placeholder'
  )
}

const hasValidEnv = looksLikeHttpUrl(envUrl) && !isPlaceholder(envUrl) && !!envAnon && !isPlaceholder(envAnon)

let supabaseInstance: SupabaseClient | null = null
try {
  supabaseInstance = hasValidEnv ? createClient(envUrl, envAnon) : null
} catch {
  supabaseInstance = null
}

export const supabase: SupabaseClient | null = supabaseInstance

// Tipos baseados na estrutura do banco
export interface Review {
  review_id: string
  location_id: string
  rating: number
  comment?: string
  reviewer_name?: string
  create_time: string
  update_time: string
}

export interface Collaborator {
  id: number
  full_name: string
  department?: string
  position?: string
  is_active: boolean
}

export interface ReviewCollaborator {
  review_id: string
  collaborator_id: number
  mention_snippet?: string
  match_score?: number
}

export interface Location {
  location_id: string
  name: string
  title: string
  current_rating: number
  total_reviews_count: number
}

// Funções de busca de dados
export const fetchReviews = async (limit = 100, offset = 0): Promise<Review[]> => {
  if (!supabase) {
    return []
  }
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .order('create_time', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error
  return data || []
}

export const fetchReviewsStats = async () => {
  // Mock padrão quando Supabase não estiver configurado
  if (!supabase) {
    console.log('🔄 Supabase não configurado, usando dados mock para fetchReviewsStats')
    return {
      total_reviews: 458,
      avg_rating: 4.9650655021834061,
      oldest_review: '2025-08-02T20:17:20.573Z',
      newest_review: '2025-09-01T16:44:02.526Z',
      five_star_count: 444,
      five_star_percentage: 96.9
    }
  }

  try {
    console.log('📡 Chamando RPC get_reviews_stats...')
    const { data, error } = await supabase.rpc('get_reviews_stats')

    if (error) {
      console.error('❌ Erro na RPC get_reviews_stats:', error)
      // Fallback para query direta se a função não existir
      console.log('🔄 Tentando fallback com query direta...')
      const { data: stats, error: statsError } = await supabase
        .from('reviews')
        .select('rating, create_time')

      if (statsError) {
        console.error('❌ Erro no fallback:', statsError)
        throw statsError
      }

      const total = stats?.length || 0
      const avgRating = stats?.length
        ? stats.reduce((sum, review) => sum + review.rating, 0) / stats.length
        : 0
      const fiveStarCount = stats?.filter(review => review.rating === 5).length || 0

      const result = {
        total_reviews: total,
        avg_rating: avgRating,
        oldest_review: stats?.length ? stats[stats.length - 1]?.create_time : null,
        newest_review: stats?.length ? stats[0]?.create_time : null,
        five_star_count: fiveStarCount,
        five_star_percentage: total > 0 ? (fiveStarCount / total) * 100 : 0
      }

      console.log('✅ Dados obtidos via fallback:', result)
      return result
    }

    console.log('✅ Dados obtidos via RPC:', data)
    return data
  } catch (error) {
    console.error('❌ Erro geral em fetchReviewsStats:', error)
    throw error
  }
}

export const fetchCollaborators = async (): Promise<Collaborator[]> => {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('collaborators')
    .select('*')
    .eq('is_active', true)
    .order('full_name')

  if (error) throw error
  return data || []
}

export const fetchCollaboratorMentions = async (): Promise<Array<{
  full_name: string
  department: string
  mentions: number
  avg_rating_when_mentioned?: number
  latest_mention?: string
}>> => {
  if (!supabase) {
    console.log('🔄 Supabase não configurado, usando dados mock para fetchCollaboratorMentions')
    return [
      { full_name: 'Ana Sophia', department: 'E-notariado', mentions: 35 },
      { full_name: 'Karen Figueiredo', department: 'E-notariado', mentions: 33 },
      { full_name: 'Kaio Gomes', department: 'E-notariado', mentions: 29 },
      { full_name: 'Letícia Andreza', department: 'E-notariado', mentions: 28 },
      { full_name: 'Fabiana Medeiros', department: 'E-notariado', mentions: 27 },
    ]
  }

  try {
    console.log('📡 Chamando RPC get_collaborator_mentions...')
    const { data, error } = await supabase.rpc('get_collaborator_mentions')

    if (error) {
      console.error('❌ Erro na RPC get_collaborator_mentions:', error)
      // Fallback para query direta
      console.log('🔄 Tentando fallback com query direta...')
      const { data: collaborators, error: collabError } = await supabase
        .from('collaborators')
        .select(`
          full_name,
          department,
          review_collaborators(count)
        `)
        .eq('is_active', true)
        .order('full_name')

      if (collabError) {
        console.error('❌ Erro no fallback:', collabError)
        throw collabError
      }

      // Processar os dados para contar menções
      const result = (collaborators || []).map(collaborator => ({
        full_name: collaborator.full_name,
        department: collaborator.department || 'Não informado',
        mentions: Array.isArray(collaborator.review_collaborators)
          ? collaborator.review_collaborators.length
          : 0
      })).sort((a, b) => b.mentions - a.mentions)

      console.log('✅ Dados obtidos via fallback:', result)
      return result
    }

    console.log('✅ Dados obtidos via RPC:', data)
    return data || []
  } catch (error) {
    console.error('❌ Erro geral em fetchCollaboratorMentions:', error)
    throw error
  }
}

export const fetchLocation = async (): Promise<Location | null> => {
  if (!supabase) {
    return {
      location_id: 'mock',
      name: 'Cartório Paulista',
      title: 'Cartório Paulista - 2º Cartório de Notas de São Paulo',
      current_rating: 4.8,
      total_reviews_count: 8537,
    }
  }
  const { data, error } = await supabase
    .from('gbp_locations')
    .select('*')
    .limit(1)
    .single()

  if (error) throw error
  return data
}

export const fetchRatingDistribution = async (): Promise<Array<{
  rating: number
  count: number
  percentage: number
}>> => {
  if (!supabase) {
    const total = 458
    const dist = [
      { rating: 5, count: 444 },
      { rating: 4, count: 13 },
      { rating: 3, count: 0 },
      { rating: 2, count: 1 },
      { rating: 1, count: 0 },
    ]
    return dist.map(d => ({ ...d, percentage: total > 0 ? (d.count / total) * 100 : 0 }))
  }
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')

  if (error) throw error

  const total = data?.length || 0
  const distribution = [1, 2, 3, 4, 5].map(rating => {
    const count = data?.filter(review => review.rating === rating).length || 0
    return {
      rating,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    }
  })

  return distribution
}

// Função para buscar avaliações recentes usando RPC
export const fetchRecentReviews = async (limit = 10): Promise<Array<{
  review_id: string
  rating: number
  comment: string
  reviewer_name: string
  create_time: string
  collection_source: string
}>> => {
  if (!supabase) {
    console.log('🔄 Supabase não configurado, usando dados mock para fetchRecentReviews')
    return [
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
      }
    ].slice(0, limit)
  }

  try {
    console.log(`📡 Chamando RPC get_recent_reviews com limit ${limit}...`)
    const { data, error } = await supabase.rpc('get_recent_reviews', { limit_param: limit })

    if (error) {
      console.error('❌ Erro na RPC get_recent_reviews:', error)
      // Fallback para query direta
      console.log('🔄 Tentando fallback com query direta...')
      const { data: reviews, error: reviewsError } = await supabase
        .from('reviews')
        .select('review_id, rating, comment, reviewer_name, create_time')
        .order('create_time', { ascending: false })
        .limit(limit)

      if (reviewsError) {
        console.error('❌ Erro no fallback:', reviewsError)
        throw reviewsError
      }

      const result = (reviews || []).map(review => ({
        ...review,
        collection_source: 'google'
      }))

      console.log('✅ Dados obtidos via fallback:', result)
      return result
    }

    console.log('✅ Dados obtidos via RPC:', data)
    return data || []
  } catch (error) {
    console.error('❌ Erro geral em fetchRecentReviews:', error)
    throw error
  }
}

// Função para buscar dados mensais para gráficos
export const fetchMonthlyTrends = async (): Promise<Array<{
  month: string
  total_reviews: number
  avg_rating: number
  five_star_count?: number
}>> => {
  if (!supabase) {
    console.log('🔄 Supabase não configurado, usando dados mock para fetchMonthlyTrends')
    return [
      { month: '2025-09', total_reviews: 45, avg_rating: 4.8, five_star_count: 42 },
      { month: '2025-08', total_reviews: 52, avg_rating: 4.9, five_star_count: 50 },
      { month: '2025-07', total_reviews: 38, avg_rating: 4.7, five_star_count: 35 },
      { month: '2025-06', total_reviews: 41, avg_rating: 4.8, five_star_count: 39 },
      { month: '2025-05', total_reviews: 47, avg_rating: 4.9, five_star_count: 45 },
      { month: '2025-04', total_reviews: 33, avg_rating: 4.6, five_star_count: 30 }
    ]
  }

  try {
    console.log('📡 Chamando RPC get_monthly_trends...')
    const { data, error } = await supabase.rpc('get_monthly_trends')

    if (error) {
      console.error('❌ Erro na RPC get_monthly_trends:', error)
      // Fallback para query direta
      console.log('🔄 Tentando fallback com query direta...')
      const { data: trends, error: trendsError } = await supabase
        .from('reviews')
        .select('rating, create_time')
        .gte('create_time', new Date(Date.now() - 11 * 30 * 24 * 60 * 60 * 1000).toISOString())

      if (trendsError) {
        console.error('❌ Erro no fallback:', trendsError)
        throw trendsError
      }

      // Agrupar por mês
      const monthlyData: { [key: string]: { ratings: number[], count: number } } = {}
      
      trends?.forEach(review => {
        const month = new Date(review.create_time).toISOString().substring(0, 7) // YYYY-MM
        if (!monthlyData[month]) {
          monthlyData[month] = { ratings: [], count: 0 }
        }
        monthlyData[month].ratings.push(review.rating)
        monthlyData[month].count++
      })

      const result = Object.entries(monthlyData)
        .map(([month, data]) => ({
          month,
          total_reviews: data.count,
          avg_rating: data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length,
          five_star_count: data.ratings.filter(r => r === 5).length
        }))
        .sort((a, b) => b.month.localeCompare(a.month))

      console.log('✅ Dados obtidos via fallback:', result)
      return result
    }

    console.log('✅ Dados obtidos via RPC:', data)
    return data || []
  } catch (error) {
    console.error('❌ Erro geral em fetchMonthlyTrends:', error)
    throw error
  }
}
