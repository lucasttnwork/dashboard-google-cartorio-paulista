import { apiClient } from './client'
import type { ReviewDetailOut, ReviewListResponse } from '@/types/review'

const BASE = '/api/v1/reviews'

export async function fetchReviews(params: {
  cursor?: string
  limit?: number
  rating?: number
  search?: string
  date_from?: string
  date_to?: string
  has_reply?: boolean
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}): Promise<ReviewListResponse> {
  const { data } = await apiClient.get<ReviewListResponse>(`${BASE}/`, { params })
  return data
}

export async function fetchReview(reviewId: string): Promise<ReviewDetailOut> {
  const { data } = await apiClient.get<ReviewDetailOut>(`${BASE}/${reviewId}`)
  return data
}
