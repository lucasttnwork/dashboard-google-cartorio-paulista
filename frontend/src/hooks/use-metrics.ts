import { useQuery } from '@tanstack/react-query'
import {
  fetchCollaboratorMentions,
  fetchMetricsOverview,
  fetchMyPerformance,
  fetchSystemUsers,
  fetchTrends,
} from '@/lib/api/metrics'

export function useMetricsOverview(params?: {
  date_from?: string
  date_to?: string
}) {
  return useQuery({
    queryKey: ['metrics-overview', params],
    queryFn: () => fetchMetricsOverview(params),
    staleTime: 60_000,
  })
}

export function useTrends(params?: {
  months?: number
  location_id?: string
}) {
  return useQuery({
    queryKey: ['metrics-trends', params],
    queryFn: () => fetchTrends(params),
    staleTime: 60_000,
  })
}

export function useCollaboratorMentions(params?: {
  months?: number
  include_inactive?: boolean
}) {
  return useQuery({
    queryKey: ['metrics-collaborator-mentions', params],
    queryFn: () => fetchCollaboratorMentions(params),
    staleTime: 60_000,
  })
}

export function useMyPerformance() {
  return useQuery({
    queryKey: ['my-performance'],
    queryFn: fetchMyPerformance,
    staleTime: 60_000,
  })
}

export function useSystemUsers() {
  return useQuery({
    queryKey: ['system-users'],
    queryFn: fetchSystemUsers,
    staleTime: 120_000,
  })
}
