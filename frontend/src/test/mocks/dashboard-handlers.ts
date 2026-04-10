import { http, HttpResponse } from 'msw'
import type { MetricsOverview, TrendsData, CollaboratorMentionsData } from '@/types/metrics'
import type { ReviewListResponse, ReviewDetailOut } from '@/types/review'

const API = import.meta.env.VITE_API_BASE_URL ?? ''

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

export const mockMetricsOverview: MetricsOverview = {
  total_reviews: 347,
  avg_rating: 4.72,
  five_star_pct: 82.4,
  one_star_pct: 1.7,
  total_with_comment: 210,
  total_with_reply: 180,
  total_enotariado: 95,
  avg_rating_enotariado: 4.85,
  total_collaborators_active: 8,
  total_mentions: 124,
  period_start: '2025-04-01',
  period_end: '2026-04-01',
}

export const mockTrendsData: TrendsData = {
  months: [
    {
      month: '2026-01-01',
      total_reviews: 28,
      avg_rating: 4.65,
      reviews_enotariado: 8,
      avg_rating_enotariado: 4.9,
    },
    {
      month: '2026-02-01',
      total_reviews: 35,
      avg_rating: 4.7,
      reviews_enotariado: 10,
      avg_rating_enotariado: 4.85,
    },
    {
      month: '2026-03-01',
      total_reviews: 42,
      avg_rating: 4.78,
      reviews_enotariado: 12,
      avg_rating_enotariado: 4.92,
    },
  ],
}

export const mockCollaboratorMentions: CollaboratorMentionsData = {
  collaborators: [
    {
      collaborator_id: 1,
      full_name: 'Ana Silva',
      is_active: true,
      total_mentions: 32,
      avg_rating_mentioned: 4.9,
      monthly: [
        { month: '2026-03-01', mentions: 12, avg_rating: 4.95 },
      ],
    },
    {
      collaborator_id: 2,
      full_name: 'Bruno Costa',
      is_active: true,
      total_mentions: 18,
      avg_rating_mentioned: 4.6,
      monthly: [
        { month: '2026-03-01', mentions: 7, avg_rating: 4.5 },
      ],
    },
    {
      collaborator_id: 3,
      full_name: 'Carla Oliveira',
      is_active: true,
      total_mentions: 10,
      avg_rating_mentioned: 4.8,
      monthly: [],
    },
  ],
}

export const mockReviewList: ReviewListResponse = {
  items: [
    {
      review_id: 'rev-001',
      location_id: 'loc-1',
      rating: 5,
      comment: 'Excelente atendimento, Ana foi muito atenciosa e resolveu tudo rapidamente.',
      reviewer_name: 'Maria Souza',
      is_anonymous: false,
      create_time: '2026-03-20T14:30:00Z',
      update_time: null,
      reply_text: 'Obrigado pelo feedback, Maria!',
      reply_time: '2026-03-21T09:00:00Z',
      review_url: 'https://g.co/review/1',
      is_local_guide: true,
      sentiment: 'pos',
      is_enotariado: false,
      collaborator_names: ['Ana Silva'],
    },
    {
      review_id: 'rev-002',
      location_id: 'loc-1',
      rating: 4,
      comment: 'Bom atendimento, poderia ser mais rapido.',
      reviewer_name: 'Joao Pereira',
      is_anonymous: false,
      create_time: '2026-03-18T10:00:00Z',
      update_time: null,
      reply_text: null,
      reply_time: null,
      review_url: null,
      is_local_guide: false,
      sentiment: 'neu',
      is_enotariado: true,
      collaborator_names: [],
    },
    {
      review_id: 'rev-003',
      location_id: 'loc-1',
      rating: 5,
      comment: null,
      reviewer_name: null,
      is_anonymous: true,
      create_time: '2026-03-15T16:00:00Z',
      update_time: null,
      reply_text: null,
      reply_time: null,
      review_url: null,
      is_local_guide: false,
      sentiment: null,
      is_enotariado: false,
      collaborator_names: [],
    },
  ],
  next_cursor: null,
  has_more: false,
  total: 3,
}

export const mockReviewDetail: ReviewDetailOut = {
  review_id: 'rev-001',
  location_id: 'loc-1',
  rating: 5,
  comment: 'Excelente atendimento, Ana foi muito atenciosa e resolveu tudo rapidamente.',
  reviewer_name: 'Maria Souza',
  is_anonymous: false,
  create_time: '2026-03-20T14:30:00Z',
  update_time: null,
  reply_text: 'Obrigado pelo feedback, Maria!',
  reply_time: '2026-03-21T09:00:00Z',
  review_url: 'https://g.co/review/1',
  is_local_guide: true,
  sentiment: 'pos',
  is_enotariado: false,
  collaborator_names: ['Ana Silva'],
  original_language: 'pt',
  translated_text: null,
  response_text: null,
  response_time: null,
  reviewer_id: 'reviewer-001',
  reviewer_url: null,
  reviewer_photo_url: null,
  collection_source: 'google',
  processed_at: '2026-03-20T15:00:00Z',
  mentions: [
    {
      collaborator_id: 1,
      collaborator_name: 'Ana Silva',
      mention_snippet: 'Ana foi muito atenciosa',
      match_score: 0.95,
    },
  ],
}

// ---------------------------------------------------------------------------
// MSW Handlers
// ---------------------------------------------------------------------------

export const dashboardHandlers = [
  // ---- Reviews ----
  http.get(`${API}/api/v1/reviews`, () => {
    return HttpResponse.json(mockReviewList)
  }),

  http.get(`${API}/api/v1/reviews/:id`, ({ params }) => {
    const { id } = params
    if (id === mockReviewDetail.review_id) {
      return HttpResponse.json(mockReviewDetail)
    }
    return HttpResponse.json({ detail: 'not_found' }, { status: 404 })
  }),

  // ---- Metrics ----
  http.get(`${API}/api/v1/metrics/overview`, () => {
    return HttpResponse.json(mockMetricsOverview)
  }),

  http.get(`${API}/api/v1/metrics/trends`, () => {
    return HttpResponse.json(mockTrendsData)
  }),

  http.get(`${API}/api/v1/metrics/collaborator-mentions`, () => {
    return HttpResponse.json(mockCollaboratorMentions)
  }),
]
