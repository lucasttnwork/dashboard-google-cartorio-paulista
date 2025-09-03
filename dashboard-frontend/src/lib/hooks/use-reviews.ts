import { useQuery } from '@tanstack/react-query'
import {
  fetchReviews,
  fetchReviewsStats,
  fetchRatingDistribution,
  Review
} from '@/lib/adapters/supabase'

export function useReviews(limit = 100, offset = 0) {
  return useQuery({
    queryKey: ['reviews', limit, offset],
    queryFn: () => fetchReviews(limit, offset),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useReviewsStats() {
  return useQuery({
    queryKey: ['reviews-stats'],
    queryFn: fetchReviewsStats,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}

export function useRatingDistribution() {
  return useQuery({
    queryKey: ['rating-distribution'],
    queryFn: fetchRatingDistribution,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Hook para dados de exemplo/mock quando não há dados reais
export function useMockReviewsData() {
  return useQuery({
    queryKey: ['mock-reviews-data'],
    queryFn: () => {
      // Dados mock baseados na análise que fizemos do banco
      const mockData = [
        { date: '2025-08-01', reviews: 15, rating: 4.8 },
        { date: '2025-08-02', reviews: 22, rating: 4.9 },
        { date: '2025-08-03', reviews: 18, rating: 4.7 },
        { date: '2025-08-04', reviews: 25, rating: 5.0 },
        { date: '2025-08-05', reviews: 20, rating: 4.8 },
        { date: '2025-08-06', reviews: 28, rating: 4.9 },
        { date: '2025-08-07', reviews: 16, rating: 4.6 },
        { date: '2025-08-08', reviews: 30, rating: 5.0 },
        { date: '2025-08-09', reviews: 24, rating: 4.8 },
        { date: '2025-08-10', reviews: 19, rating: 4.7 },
        { date: '2025-08-11', reviews: 26, rating: 4.9 },
        { date: '2025-08-12', reviews: 21, rating: 4.8 },
        { date: '2025-08-13', reviews: 17, rating: 4.6 },
        { date: '2025-08-14', reviews: 29, rating: 5.0 },
        { date: '2025-08-15', reviews: 23, rating: 4.9 },
        { date: '2025-08-16', reviews: 18, rating: 4.7 },
        { date: '2025-08-17', reviews: 27, rating: 4.8 },
        { date: '2025-08-18', reviews: 20, rating: 4.6 },
        { date: '2025-08-19', reviews: 31, rating: 5.0 },
        { date: '2025-08-20', reviews: 25, rating: 4.9 },
        { date: '2025-08-21', reviews: 22, rating: 4.8 },
        { date: '2025-08-22', reviews: 19, rating: 4.7 },
        { date: '2025-08-23', reviews: 28, rating: 4.9 },
        { date: '2025-08-24', reviews: 24, rating: 4.8 },
        { date: '2025-08-25', reviews: 21, rating: 4.6 },
        { date: '2025-08-26', reviews: 26, rating: 4.9 },
        { date: '2025-08-27', reviews: 23, rating: 4.8 },
        { date: '2025-08-28', reviews: 20, rating: 4.7 },
        { date: '2025-08-29', reviews: 29, rating: 5.0 },
        { date: '2025-08-30', reviews: 27, rating: 4.9 },
        { date: '2025-08-31', reviews: 25, rating: 4.8 },
        { date: '2025-09-01', reviews: 24, rating: 4.9 },
      ]

      return mockData
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })
}
