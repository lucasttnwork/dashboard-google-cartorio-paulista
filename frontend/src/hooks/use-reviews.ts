import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { fetchReview, fetchReviews } from '@/lib/api/reviews'

export function useReviews(params: {
  rating?: number
  search?: string
  date_from?: string
  date_to?: string
  has_reply?: boolean
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  collaborator_id?: number[]
  sentiment?: string
}) {
  return useInfiniteQuery({
    queryKey: ['reviews', params],
    queryFn: ({ pageParam }) => fetchReviews({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.next_cursor : undefined,
    staleTime: 30_000,
  })
}

export function useReviewDetail(reviewId: string | null) {
  return useQuery({
    queryKey: ['review', reviewId],
    queryFn: () => fetchReview(reviewId!),
    enabled: !!reviewId,
    staleTime: 60_000,
  })
}
