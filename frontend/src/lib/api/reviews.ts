import { apiClient } from './client'
import type { ReviewDetailOut, ReviewListResponse } from '@/types/review'

const BASE = '/api/v1/reviews'

export interface ReviewsQueryParams {
  cursor?: string
  limit?: number
  rating?: number
  search?: string
  date_from?: string
  date_to?: string
  has_reply?: boolean
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  /** Multi-select: only reviews that mention ≥1 of these collaborators. */
  collaborator_id?: number[]
  /** Sentiment filter: 'pos' | 'neu' | 'neg' | 'unknown'. */
  sentiment?: string
}

export async function fetchReviews(
  params: ReviewsQueryParams,
): Promise<ReviewListResponse> {
  const { data } = await apiClient.get<ReviewListResponse>(`${BASE}/`, {
    params,
    // Serialize arrays as repeated params: `?collaborator_id=1&collaborator_id=2`
    // FastAPI parses these as list[int] natively.
    paramsSerializer: {
      indexes: null,
    },
  })
  return data
}

export async function fetchReview(reviewId: string): Promise<ReviewDetailOut> {
  const { data } = await apiClient.get<ReviewDetailOut>(`${BASE}/${reviewId}`)
  return data
}
