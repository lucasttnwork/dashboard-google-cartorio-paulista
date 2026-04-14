import { apiClient } from './client'
import type {
  CollaboratorMentionsData,
  DataStatus,
  MetricsOverview,
  MyPerformance,
  SystemUser,
  TrendsData,
} from '@/types/metrics'
import type { CollaboratorProfile } from '@/types/collaborator'

const BASE = '/api/v1/metrics'

export async function fetchMetricsOverview(params?: {
  date_from?: string
  date_to?: string
  compare_previous?: boolean
}): Promise<MetricsOverview> {
  const { data } = await apiClient.get<MetricsOverview>(`${BASE}/overview`, {
    params,
  })
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

export async function fetchMyPerformance(): Promise<MyPerformance> {
  const { data } = await apiClient.get<MyPerformance>(`${BASE}/my-performance`)
  return data
}

export async function fetchSystemUsers(): Promise<SystemUser[]> {
  const { data } = await apiClient.get<SystemUser[]>('/api/v1/collaborators/admin/users')
  return data
}

/**
 * Data freshness indicator — last review timestamp + last successful
 * collection run. Cached 5 min on the client (see `useDataStatus`).
 */
export async function fetchDataStatus(): Promise<DataStatus> {
  const { data } = await apiClient.get<DataStatus>(`${BASE}/data-status`)
  return data
}

/**
 * Full profile for a single collaborator, used by the `/collaborators/:id`
 * route. Aggregates historical KPIs, a 6m-vs-prev-6m delta baseline, a
 * rating distribution restricted to mentions of this collaborator, the
 * last 12 months of monthly counts, and the 20 most recent reviews
 * mentioning them.
 */
export async function fetchCollaboratorProfile(
  id: number,
): Promise<CollaboratorProfile> {
  const { data } = await apiClient.get<CollaboratorProfile>(
    `/api/v1/collaborators/${id}/profile`,
  )
  return data
}
