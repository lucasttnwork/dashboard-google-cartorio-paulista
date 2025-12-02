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

// Permitir fallback dinâmico via localStorage no cliente (sem reiniciar o servidor)
let runtimeUrl = envUrl
let runtimeAnon = envAnon
if (typeof window !== 'undefined') {
  try {
    const lsUrl = window.localStorage.getItem('SUPABASE_URL') || ''
    const lsAnon = window.localStorage.getItem('SUPABASE_ANON_KEY') || ''
    if (looksLikeHttpUrl(lsUrl) && !isPlaceholder(lsUrl) && !!lsAnon && !isPlaceholder(lsAnon)) {
      runtimeUrl = lsUrl
      runtimeAnon = lsAnon
    }
  } catch {}
}

const hasValidEnv = looksLikeHttpUrl(runtimeUrl) && !isPlaceholder(runtimeUrl) && !!runtimeAnon && !isPlaceholder(runtimeAnon)

let supabaseInstance: SupabaseClient | null = null
try {
  supabaseInstance = hasValidEnv ? createClient(runtimeUrl, runtimeAnon) : null
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
  // Em produção, não retornar mocks quando o Supabase não estiver configurado
  if (!supabase) {
    console.warn('⚠️ Supabase não configurado; retornando métricas vazias em fetchReviewsStats')
    return {
      total_reviews: 0,
      avg_rating: 0,
      oldest_review: null,
      newest_review: null,
      five_star_count: 0,
      five_star_percentage: 0
    }
  }

  try {
    console.log('📡 Chamando RPC get_reviews_stats...')
    const { data, error } = await supabase.rpc('get_reviews_stats', { p_location_id: 'cartorio-paulista-location' })

    if (error) {
      console.error('❌ Erro na RPC get_reviews_stats:', error)
      // Fallback para query direta se a função não existir
      console.log('🔄 Tentando fallback com query direta...')
      const { data: stats, error: statsError } = await supabase
        .from('reviews')
        .select('rating, create_time')
        .order('create_time', { ascending: false })

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
    // Algumas RPCs retornam array com uma linha
    return Array.isArray(data) ? (data[0] || null) : data
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

// Total de colaboradores ativos
export const fetchActiveCollaboratorsCount = async (): Promise<number> => {
  if (!supabase) return 9 // fallback solicitado
  const { count, error } = await supabase
    .from('collaborators')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  if (error) throw error
  return count ?? 0
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

// Menções de colaboradores por mês
export const fetchCollaboratorMentionsByMonth = async (month: string): Promise<Array<{
  full_name: string
  department: string
  mentions: number
  avg_rating_when_mentioned?: number
  latest_mention?: string
}>> => {
  const mockCollaborators = [
    { full_name: 'Ana Sophia', department: 'E-notariado', mentions: Math.floor(Math.random() * 10) + 25 },
    { full_name: 'Karen Figueiredo', department: 'E-notariado', mentions: Math.floor(Math.random() * 10) + 20 },
    { full_name: 'Kaio Gomes', department: 'E-notariado', mentions: Math.floor(Math.random() * 10) + 18 },
    { full_name: 'Letícia Andreza', department: 'E-notariado', mentions: Math.floor(Math.random() * 10) + 15 },
    { full_name: 'Fabiana Medeiros', department: 'E-notariado', mentions: Math.floor(Math.random() * 10) + 12 },
  ].sort((a, b) => b.mentions - a.mentions)

  if (!supabase) {
    console.log('🔄 Supabase não configurado, retornando dados mock para fetchCollaboratorMentionsByMonth')
    return mockCollaborators
  }

  // Tentar RPC primeiro
  try {
    const { data, error } = await supabase.rpc('get_collaborator_mentions_by_month', { p_month: month })
    if (!error && data && data.length > 0) return data
    console.warn('⚠️ RPC get_collaborator_mentions_by_month indisponível, usando fallback com consultas diretas:', error)
  } catch (e) {
    console.warn('⚠️ Falha ao chamar RPC get_collaborator_mentions_by_month, usando fallback:', e)
  }

  // Fallback: buscar review_ids do mês e cruzar com review_collaborators e collaborators
  try {
    const start = new Date(`${month}-01T00:00:00.000Z`)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)

    console.log(`📡 Buscando reviews de ${month} com paginação...`)

    // PAGINAÇÃO: Buscar TODAS as reviews do mês
    let allMonthReviews: any[] = []
    let offset = 0
    const limit = 1000
    let hasMore = true

    while (hasMore) {
      const { data: monthReviews, error: revErr } = await supabase
        .from('reviews')
        .select('review_id, create_time')
        .gte('create_time', start.toISOString())
        .lt('create_time', end.toISOString())
        .range(offset, offset + limit - 1)

      if (revErr) {
        console.error('❌ Erro ao buscar reviews:', revErr)
        if (offset === 0) {
          console.log('⚠️ Retornando dados mock')
          return mockCollaborators
        }
        break
      }

      if (!monthReviews || monthReviews.length === 0) break

      allMonthReviews = allMonthReviews.concat(monthReviews)
      console.log(`   Processadas ${allMonthReviews.length} reviews...`)

      hasMore = monthReviews.length === limit
      offset += limit
    }

    const reviewIds = allMonthReviews.map(r => r.review_id)
    console.log(`✅ Total de reviews de ${month}: ${reviewIds.length}`)

    if (reviewIds.length === 0) {
      console.log('⚠️ Nenhuma review encontrada no mês, retornando dados mock')
      return mockCollaborators
    }

    console.log(`📡 Buscando menções dessas ${reviewIds.length} reviews...`)

    // Criar Set para lookup rápido
    const reviewIdsSet = new Set(reviewIds)

    // Buscar TODAS as review_collaborators e filtrar no cliente
    // (Abordagem mais confiável que .in() com arrays grandes)
    const { data: allReviewCollaborators, error: rcErr } = await supabase
      .from('review_collaborators')
      .select('review_id, collaborator_id')

    if (rcErr) {
      console.error('❌ Erro ao buscar review_collaborators:', rcErr)
      console.log('⚠️ Retornando dados mock')
      return mockCollaborators
    }

    // Filtrar apenas as menções das reviews do mês
    const allMentions = (allReviewCollaborators || []).filter(rc =>
      reviewIdsSet.has(rc.review_id)
    )

    console.log(`✅ Total de menções encontradas: ${allMentions.length}`)

    if (allMentions.length === 0) {
      console.log('⚠️ Nenhuma menção encontrada, retornando dados mock')
      return mockCollaborators
    }

    // Contar menções por collaborator_id
    const counts = new Map<number, number>()
    allMentions.forEach(row => {
      const current = counts.get(row.collaborator_id as unknown as number) || 0
      counts.set(row.collaborator_id as unknown as number, current + 1)
    })

    if (counts.size === 0) {
      console.log('⚠️ Nenhuma menção encontrada, retornando dados mock')
      return mockCollaborators
    }

    const collaboratorIds = Array.from(counts.keys())
    const { data: collabs, error: collabErr } = await supabase
      .from('collaborators')
      .select('id, full_name, department')
      .in('id', collaboratorIds)

    if (collabErr) {
      console.error('❌ Erro ao buscar colaboradores:', collabErr)
      console.log('⚠️ Retornando dados mock')
      return mockCollaborators
    }

    const byId = new Map<number, { full_name: string; department?: string }>()
    ;(collabs || []).forEach(c => byId.set(c.id as unknown as number, { full_name: c.full_name, department: c.department }))

    const result = collaboratorIds
      .map(id => ({
        full_name: byId.get(id)?.full_name || `Colaborador ${id}`,
        department: byId.get(id)?.department || 'Não informado',
        mentions: counts.get(id) || 0
      }))
      .sort((a, b) => b.mentions - a.mentions)

    return result.length > 0 ? result : mockCollaborators
  } catch (error) {
    console.error('❌ Erro no fallback de fetchCollaboratorMentionsByMonth:', error)
    console.log('⚠️ Retornando dados mock devido a exceção')
    return mockCollaborators
  }
}

// Tendências diárias do mês específico
export const fetchDailyTrendsForMonth = async (month: string): Promise<Array<{
  day: string
  total_reviews: number
  avg_rating: number
  five_star_count?: number
}>> => {
  // Gerar dados mock para o mês solicitado
  const generateMockDataForMonth = (month: string) => {
    const start = new Date(`${month}-01T00:00:00.000Z`)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)

    const mockData: Array<{ day: string; total_reviews: number; avg_rating: number; five_star_count: number }> = []
    const d = new Date(start)

    while (d < end) {
      const dayStr = d.toISOString().slice(0, 10)
      const total = Math.floor(Math.random() * 5) + 1 // 1-5 reviews por dia
      const avgRating = 4.5 + Math.random() * 0.5 // 4.5-5.0
      const fiveStars = Math.floor(total * 0.8) // ~80% são 5 estrelas

      mockData.push({
        day: dayStr,
        total_reviews: total,
        avg_rating: Number(avgRating.toFixed(1)),
        five_star_count: fiveStars
      })

      d.setUTCDate(d.getUTCDate() + 1)
    }

    return mockData
  }

  if (!supabase) {
    console.log('🔄 Supabase não configurado, retornando dados mock para fetchDailyTrendsForMonth')
    return generateMockDataForMonth(month)
  }

  // Tentar RPC primeiro
  try {
    const { data, error } = await supabase.rpc('get_daily_trends_for_month', { p_month: month })
    if (error) throw error

    const result = (data || []).map((d: any) => ({
      day: String(d.day),
      total_reviews: Number(d.total_reviews || 0),
      avg_rating: Number(d.avg_rating || 0),
      five_star_count: Number(d.five_star_count || 0)
    }))

    return result.length > 0 ? result : generateMockDataForMonth(month)
  } catch (rpcError) {
    console.warn('⚠️ RPC get_daily_trends_for_month indisponível, usando fallback:', rpcError)
  }

  // Fallback: computar por dia via tabela reviews
  try {
    const start = new Date(`${month}-01T00:00:00.000Z`)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)

    const { data, error } = await supabase
      .from('reviews')
      .select('create_time, rating')
      .gte('create_time', start.toISOString())
      .lt('create_time', end.toISOString())

    if (error) {
      console.error('❌ Erro no fallback:', error)
      console.log('⚠️ Retornando dados mock')
      return generateMockDataForMonth(month)
    }

    const byDay: Record<string, { ratings: number[] }> = {}
    ;(data || []).forEach(r => {
      const day = new Date(r.create_time).toISOString().slice(0, 10)
      if (!byDay[day]) byDay[day] = { ratings: [] }
      byDay[day].ratings.push(r.rating)
    })

    // Construir todos os dias do mês
    const out: Array<{ day: string; total_reviews: number; avg_rating: number; five_star_count: number }> = []
    const d = new Date(start)
    while (d < end) {
      const dayStr = d.toISOString().slice(0, 10)
      const entry = byDay[dayStr]
      const total = entry ? entry.ratings.length : 0
      const avg = total > 0 ? entry!.ratings.reduce((s, x) => s + x, 0) / total : 0
      const five = entry ? entry.ratings.filter(x => x === 5).length : 0
      out.push({ day: dayStr, total_reviews: total, avg_rating: avg, five_star_count: five })
      d.setUTCDate(d.getUTCDate() + 1)
    }

    return out.length > 0 ? out : generateMockDataForMonth(month)
  } catch (error) {
    console.error('❌ Erro no fallback de fetchDailyTrendsForMonth:', error)
    console.log('⚠️ Retornando dados mock devido a exceção')
    return generateMockDataForMonth(month)
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
    console.log(`📡 Chamando RPC get_recent_reviews_with_fallback com limit ${limit}...`)
    let { data, error } = await supabase.rpc('get_recent_reviews_with_fallback', { limit_param: limit, p_location_id: 'cartorio-paulista-location' })

    if (error) {
      console.warn('⚠️ RPC get_recent_reviews_with_fallback indisponível, tentando get_recent_reviews...', error)
      const alt = await supabase.rpc('get_recent_reviews', { limit_param: limit, p_location_id: 'cartorio-paulista-location' })
      data = alt.data as any
      error = alt.error as any
    }

    if (error) {
      console.error('❌ Erro nas RPCs de reviews recentes:', error)
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
    // Normalizar shape (algumas RPCs usam display_time)
    return (data || []).map((r: any) => ({
      review_id: r.review_id,
      rating: r.rating,
      comment: r.comment,
      reviewer_name: r.reviewer_name,
      create_time: r.display_time ?? r.create_time,
      collection_source: r.collection_source ?? 'google'
    }))
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
  const mockData = [
    { month: '2025-09', total_reviews: 45, avg_rating: 4.8, five_star_count: 42 },
    { month: '2025-08', total_reviews: 52, avg_rating: 4.9, five_star_count: 50 },
    { month: '2025-07', total_reviews: 38, avg_rating: 4.7, five_star_count: 35 },
    { month: '2025-06', total_reviews: 41, avg_rating: 4.8, five_star_count: 39 },
    { month: '2025-05', total_reviews: 47, avg_rating: 4.9, five_star_count: 45 },
    { month: '2025-04', total_reviews: 33, avg_rating: 4.6, five_star_count: 30 }
  ]

  if (!supabase) {
    console.log('🔄 Supabase não configurado, usando dados mock para fetchMonthlyTrends')
    return mockData
  }

  try {
    console.log('📡 Chamando RPC get_monthly_trends...')
    const { data, error } = await supabase.rpc('get_monthly_trends', { p_location_id: 'cartorio-paulista-location' })

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
        console.log('⚠️ Retornando dados mock devido a erro de conexão')
        return mockData
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
      return result.length > 0 ? result : mockData
    }

    console.log('✅ Dados obtidos via RPC:', data)
    return (data && data.length > 0) ? data : mockData
  } catch (error) {
    console.error('❌ Erro geral em fetchMonthlyTrends:', error)
    console.log('⚠️ Retornando dados mock devido a exceção')
    return mockData
  }
}

// Tendências diárias para o gráfico
export const fetchDailyTrends = async (days = 30): Promise<Array<{
  day: string
  total_reviews: number
  avg_rating: number
  five_star_count?: number
}>> => {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.rpc('get_daily_trends', { p_days: days, p_location_id: 'cartorio-paulista-location' })
    if (error) throw error

    // Mapear resultados por dia para preencher dias ausentes com zero
    const byDay: Record<string, { total_reviews: number; avg_rating: number; five_star_count: number }> = {}
    ;(data || []).forEach((d: any) => {
      const key = String(d.day)
      byDay[key] = {
        total_reviews: Number((d.total_reviews ?? d.total) || 0),
        avg_rating: Number(d.avg_rating || 0),
        five_star_count: Number(d.five_star_count || 0)
      }
    })

    const out: Array<{ day: string; total_reviews: number; avg_rating: number; five_star_count: number }> = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const dayStr = d.toISOString().slice(0, 10) // YYYY-MM-DD
      const existing = byDay[dayStr]
      out.push({
        day: dayStr,
        total_reviews: existing ? existing.total_reviews : 0,
        avg_rating: existing ? existing.avg_rating : 0,
        five_star_count: existing ? existing.five_star_count : 0
      })
    }

    return out
  } catch (error) {
    console.error('❌ Erro em fetchDailyTrends:', error)
    return []
  }
}

// Função para buscar reviews por mês
export const fetchReviewsByMonth = async (
  month: string,
  limit = 1000,
  offset = 0
): Promise<Array<{
  review_id: string
  location_id: string
  rating: number
  comment: string
  reviewer_name: string
  create_time: string
  update_time: string
  collection_source: string
}>> => {
  if (!supabase) {
    console.log('🔄 Supabase não configurado, retornando array vazio para fetchReviewsByMonth')
    return []
  }

  try {
    console.log(`📡 Chamando RPC get_reviews_by_month com mês ${month}, limit ${limit}, offset ${offset}...`)
    const { data, error } = await supabase.rpc('get_reviews_by_month', {
      p_month: month,
      p_location_id: 'cartorio-paulista-location',
      p_limit: limit,
      p_offset: offset
    })

    if (!error) {
      console.log(`✅ Dados obtidos via RPC: ${data?.length || 0} reviews`)
      return data || []
    }
    console.warn('⚠️ RPC get_reviews_by_month indisponível, usando fallback:', error)
  } catch (error) {
    console.warn('⚠️ Falha ao chamar RPC get_reviews_by_month, tentando fallback:', error)
  }

  // Fallback: query direta por intervalo de datas
  try {
    const start = new Date(`${month}-01T00:00:00.000Z`)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)

    const { data, error } = await supabase
      .from('reviews')
      .select('review_id, location_id, rating, comment, reviewer_name, create_time, update_time, collection_source')
      .eq('location_id', 'cartorio-paulista-location')
      .gte('create_time', start.toISOString())
      .lt('create_time', end.toISOString())
      .order('create_time', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return data || []
  } catch (fallbackErr) {
    console.error('❌ Erro no fallback de fetchReviewsByMonth:', fallbackErr)
    return []
  }
}

// Função para buscar estatísticas mensais
export const fetchMonthlyStats = async (month: string) => {
  if (!supabase) {
    console.log('🔄 Supabase não configurado, retornando métricas vazias para fetchMonthlyStats')
    return {
      total_reviews: 0,
      avg_rating: 0,
      five_star_percentage: 0,
      oldest_review: null,
      newest_review: null,
      five_star_count: 0
    }
  }

  try {
    console.log(`📡 Chamando RPC get_monthly_stats com mês ${month}...`)
    const { data, error } = await supabase.rpc('get_monthly_stats', { p_month: month, p_location_id: 'cartorio-paulista-location' })

    if (!error && data) {
      const result = Array.isArray(data) ? (data[0] || null) : data

      // Validar se a RPC retornou dados válidos (não apenas zeros)
      if (result && result.total_reviews > 0) {
        console.log('✅ Dados obtidos via RPC:', result)
        return result
      }

      // Se RPC retornou 0 reviews, pode estar quebrada - tentar fallback
      console.warn('⚠️ RPC retornou 0 reviews, usando fallback para validar...')
    } else {
      console.warn('⚠️ RPC get_monthly_stats indisponível, usando fallback:', error)
    }
  } catch (error) {
    console.warn('⚠️ Falha ao chamar RPC get_monthly_stats, tentando fallback:', error)
  }

  // Fallback: computar a partir de reviews do mês COM PAGINAÇÃO
  try {
    const start = new Date(`${month}-01T00:00:00.000Z`)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)

    console.log('🔄 Usando fallback com paginação para calcular estatísticas...')

    // Primeiro, pegar a contagem total
    const { count: totalCount, error: countError } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .gte('create_time', start.toISOString())
      .lt('create_time', end.toISOString())

    if (countError) throw countError

    const total = totalCount || 0
    console.log(`   Total de reviews no mês: ${total}`)

    if (total === 0) {
      return {
        total_reviews: 0,
        avg_rating: 0,
        five_star_percentage: 0,
        oldest_review: null,
        newest_review: null,
        five_star_count: 0
      }
    }

    // Buscar ratings COM PAGINAÇÃO para calcular média e contagem de 5 estrelas
    let allRatings: number[] = []
    let offset = 0
    const limit = 1000
    let hasMore = true

    while (hasMore) {
      const { data, error } = await supabase
        .from('reviews')
        .select('rating')
        .gte('create_time', start.toISOString())
        .lt('create_time', end.toISOString())
        .range(offset, offset + limit - 1)

      if (error) throw error
      if (!data || data.length === 0) break

      allRatings = allRatings.concat(data.map((r: any) => r.rating))
      console.log(`   Processados ${allRatings.length} ratings...`)

      hasMore = data.length === limit
      offset += limit
    }

    const avg = allRatings.length > 0 ? allRatings.reduce((s, r) => s + r, 0) / allRatings.length : 0
    const fiveStarCount = allRatings.filter(r => r === 5).length

    // Buscar primeira e última review
    const { data: oldest, error: oldestError } = await supabase
      .from('reviews')
      .select('create_time')
      .gte('create_time', start.toISOString())
      .lt('create_time', end.toISOString())
      .order('create_time', { ascending: true })
      .limit(1)
      .single()

    const { data: newest, error: newestError } = await supabase
      .from('reviews')
      .select('create_time')
      .gte('create_time', start.toISOString())
      .lt('create_time', end.toISOString())
      .order('create_time', { ascending: false })
      .limit(1)
      .single()

    const result = {
      total_reviews: total,
      avg_rating: avg,
      five_star_percentage: total > 0 ? (fiveStarCount / total) * 100 : 0,
      oldest_review: oldest?.create_time || null,
      newest_review: newest?.create_time || null,
      five_star_count: fiveStarCount
    }

    console.log('✅ Estatísticas calculadas via fallback:', result)
    return result

  } catch (fallbackErr) {
    console.error('❌ Erro no fallback de fetchMonthlyStats:', fallbackErr)
    return {
      total_reviews: 0,
      avg_rating: 0,
      five_star_percentage: 0,
      oldest_review: null,
      newest_review: null,
      five_star_count: 0
    }
  }
}

// Função para obter lista de meses disponíveis
export const fetchAvailableMonths = async (): Promise<string[]> => {
  const mockMonths = ['2025-09', '2025-08', '2025-07', '2025-06', '2025-05', '2025-04']

  if (!supabase) {
    console.log('🔄 Supabase não configurado, retornando meses mock para fetchAvailableMonths')
    return mockMonths
  }

  try {
    console.log('📡 Buscando meses disponíveis com paginação...')

    // Usar paginação para buscar TODOS os registros
    const months = new Set<string>()
    let offset = 0
    const limit = 1000 // Buscar 1000 por vez
    let hasMore = true

    while (hasMore) {
      const { data, error } = await supabase
        .from('reviews')
        .select('create_time')
        .not('create_time', 'is', null)
        .order('create_time', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('❌ Erro ao buscar meses disponíveis:', error)
        if (offset === 0) {
          console.log('⚠️ Retornando meses mock devido a erro')
          return mockMonths
        }
        break
      }

      if (!data || data.length === 0) {
        break
      }

      // Extrair meses únicos desta página
      data.forEach((review: any) => {
        if (!review?.create_time) return
        const raw: string = String(review.create_time)
        const month = raw.substring(0, 7)
        if (/^\d{4}-\d{2}$/.test(month)) {
          months.add(month)
        }
      })

      console.log(`   Processados ${offset + data.length} registros, ${months.size} meses únicos encontrados`)

      hasMore = data.length === limit
      offset += limit
    }

    const result = Array.from(months).sort().reverse()
    console.log(`✅ Total final: ${result.length} meses únicos:`, result)

    if (result.length === 0) {
      console.log('⚠️ Nenhum mês válido extraído, retornando meses mock')
      return mockMonths
    }

    return result
  } catch (error) {
    console.error('❌ Erro geral em fetchAvailableMonths:', error)
    console.log('⚠️ Retornando meses mock devido a exceção')
    return mockMonths
  }
}