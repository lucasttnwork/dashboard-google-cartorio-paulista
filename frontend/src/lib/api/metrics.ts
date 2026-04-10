import { apiClient } from './client'
import type {
  CollaboratorMentionsData,
  MetricsOverview,
  TrendsData,
} from '@/types/metrics'

const BASE = '/api/v1/metrics'

export async function fetchMetricsOverview(params?: {
  date_from?: string
  date_to?: string
}): Promise<MetricsOverview> {
  const { data } = await apiClient.get<MetricsOverview>(`${BASE}/overview`, { params })
  return data
}

export async function fetchTrends(params?: {
  months?: number
  location_id?: string
}): Promise<TrendsData> {
  const { data } = await apiClient.get<TrendsData>(`${BASE}/trends`, { params })
  return data
}

export async function fetchCollaboratorMentions(params?: {
  months?: number
  include_inactive?: boolean
}): Promise<CollaboratorMentionsData> {
  const { data } = await apiClient.get<CollaboratorMentionsData>(
    `${BASE}/collaborator-mentions`,
    { params },
  )
  return data
}
