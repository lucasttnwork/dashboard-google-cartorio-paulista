import { useQuery } from '@tanstack/react-query'
import {
  fetchCollaboratorMentions,
  fetchCollaboratorProfile,
  fetchDataStatus,
  fetchMetricsOverview,
  fetchMyPerformance,
  fetchSystemUsers,
  fetchTrends,
} from '@/lib/api/metrics'
import type { TrendsGranularity } from '@/types/metrics'

export function useMetricsOverview(params?: {
  date_from?: string
  date_to?: string
  compare_previous?: boolean
}) {
  return useQuery({
    // Composite key must include every param that changes the response
    // shape, otherwise react-query will hand back stale data on toggle.
    queryKey: [
      'metrics',
      'overview',
      params?.date_from ?? null,
      params?.date_to ?? null,
      params?.compare_previous ?? false,
    ],
    queryFn: () => fetchMetricsOverview(params),
    staleTime: 60_000,
  })
}

export function useTrends(params?: {
  months?: number
  location_id?: string
  date_from?: string
  date_to?: string
  granularity?: TrendsGranularity
}) {
  return useQuery({
    queryKey: [
      'metrics-trends',
      params?.months ?? null,
      params?.location_id ?? null,
      params?.date_from ?? null,
      params?.date_to ?? null,
      params?.granularity ?? 'month',
    ],
    queryFn: () => fetchTrends(params),
    staleTime: 60_000,
  })
}

export function useCollaboratorMentions(params?: {
  months?: number
  include_inactive?: boolean
  date_from?: string
  date_to?: string
}) {
  return useQuery({
    queryKey: [
      'metrics-collaborator-mentions',
      params?.months ?? null,
      params?.include_inactive ?? false,
      params?.date_from ?? null,
      params?.date_to ?? null,
    ],
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

/**
 * Fetches the single-collaborator profile payload. Disabled while `id`
 * is null so the route can render a skeleton without triggering a 404.
 */
export function useCollaboratorProfile(id: number | null) {
  return useQuery({
    queryKey: ['collaborator-profile', id],
    queryFn: () => fetchCollaboratorProfile(id as number),
    enabled: id != null,
    staleTime: 60_000,
  })
}

/**
 * Data freshness indicator. The collection worker runs every 2 hours on
 * weekdays, so the last-review timestamp may change while the tab is open.
 * Refetch on focus so returning to the tab reflects fresh state.
 */
export function useDataStatus() {
  return useQuery({
    queryKey: ['data-status'],
    queryFn: fetchDataStatus,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  })
}
