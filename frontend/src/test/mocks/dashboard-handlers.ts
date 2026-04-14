import { http, HttpResponse } from 'msw'
import type { MetricsOverview, TrendsData, CollaboratorMentionsData, DataStatus } from '@/types/metrics'
import type { CollaboratorProfile } from '@/types/collaborator'
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
  reply_rate_pct: 51.87,
  total_enotariado: 95,
  avg_rating_enotariado: 4.85,
  total_collaborators_active: 8,
  total_mentions: 124,
  rating_distribution: { '1': 6, '2': 4, '3': 12, '4': 39, '5': 286 },
  period_start: '2025-04-01',
  period_end: '2026-04-01',
  previous_period: null,
}

export const mockTrendsData: TrendsData = {
  months: [
    {
      month: '2026-01-01',
      total_reviews: 28,
      avg_rating: 4.65,
      reviews_enotariado: 8,
      avg_rating_enotariado: 4.9,
      reply_rate_pct: 50,
    },
    {
      month: '2026-02-01',
      total_reviews: 35,
      avg_rating: 4.7,
      reviews_enotariado: 10,
      avg_rating_enotariado: 4.85,
      reply_rate_pct: 52,
    },
    {
      month: '2026-03-01',
      total_reviews: 42,
      avg_rating: 4.78,
      reviews_enotariado: 12,
      avg_rating_enotariado: 4.92,
      reply_rate_pct: 55,
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
// Phase 3.7 — Collaborator profile + data status
// ---------------------------------------------------------------------------

export const mockCollaboratorProfile: CollaboratorProfile = {
  id: 1,
  full_name: 'Ana Silva',
  aliases: ['Aninha'],
  department: 'E-notariado',
  position: 'Atendente',
  is_active: true,

  total_mentions: 42,
  avg_rating: 4.87,
  ranking: 2,
  total_collaborators_active: 8,

  mentions_last_6m: 28,
  mentions_prev_6m: 14,
  avg_rating_last_6m: 4.9,
  avg_rating_prev_6m: 4.7,

  rating_distribution: { '1': 1, '2': 0, '3': 2, '4': 6, '5': 33 },

  monthly: [
    { month: '2025-10-01', mentions: 3, avg_rating: 4.8 },
    { month: '2025-11-01', mentions: 4, avg_rating: 4.85 },
    { month: '2025-12-01', mentions: 5, avg_rating: 4.9 },
    { month: '2026-01-01', mentions: 6, avg_rating: 4.92 },
    { month: '2026-02-01', mentions: 5, avg_rating: 4.88 },
    { month: '2026-03-01', mentions: 5, avg_rating: 4.9 },
  ],

  recent_reviews: [
    {
      review_id: 'rev-A-001',
      rating: 5,
      comment: 'Ana foi maravilhosa, muito atenciosa no atendimento.',
      reviewer_name: 'Maria Souza',
      create_time: '2026-03-20T14:30:00Z',
      mention_snippet: 'Ana foi maravilhosa',
      match_score: 0.97,
    },
    {
      review_id: 'rev-A-002',
      rating: 4,
      comment: 'Ana resolveu tudo rapidamente, recomendo.',
      reviewer_name: 'Joao Pereira',
      create_time: '2026-03-18T10:00:00Z',
      mention_snippet: 'Ana resolveu tudo rapidamente',
      match_score: 0.92,
    },
    {
      review_id: 'rev-A-003',
      rating: 5,
      comment: null,
      reviewer_name: 'Carla Oliveira',
      create_time: '2026-03-10T09:15:00Z',
      mention_snippet: 'atendida pela Ana',
      match_score: 0.88,
    },
  ],
}

export const mockDataStatus: DataStatus = {
  last_review_date: '2026-03-20T14:30:00Z',
  last_collection_run: '2026-04-12T03:00:00Z',
  total_reviews: 5372,
  days_since_last_review: 24,
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

  http.get(`${API}/api/v1/metrics/data-status`, () => {
    return HttpResponse.json(mockDataStatus)
  }),

  // ---- Collaborator profile (Phase 3.7) ----
  http.get(`${API}/api/v1/collaborators/:id/profile`, ({ params }) => {
    if (String(params.id) === String(mockCollaboratorProfile.id)) {
      return HttpResponse.json(mockCollaboratorProfile)
    }
    return HttpResponse.json({ detail: 'not_found' }, { status: 404 })
  }),
]
