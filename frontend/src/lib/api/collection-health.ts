import { apiClient } from './client'

export interface CollectionRunHealth {
  id: number
  run_type: string
  status: string
  started_at: string | null
  completed_at: string | null
  reviews_found: number
  reviews_new: number
  reviews_updated: number
  error_message: string | null
  execution_time_ms: number | null
}

export interface CollectionHealthData {
  runs: CollectionRunHealth[]
  consecutive_failures: number
  last_success_at: string | null
  is_degraded: boolean
}

export async function fetchCollectionHealth(): Promise<CollectionHealthData> {
  const { data } = await apiClient.get<CollectionHealthData>(
    '/api/v1/admin/collection-health/',
  )
  return data
}

export async function resetDegradedState(): Promise<{ ok: boolean }> {
  const { data } = await apiClient.post<{ ok: boolean }>(
    '/api/v1/admin/collection-health/reset/',
  )
  return data
}
