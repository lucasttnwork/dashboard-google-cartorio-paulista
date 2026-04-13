import { apiClient } from './client'
import type {
  Collaborator,
  CollaboratorCreate,
  CollaboratorListResponse,
  CollaboratorUpdate,
  CSVImportResponse,
  MergeRequest,
  MergeResponse,
} from '@/types/collaborator'

const BASE = '/api/v1/collaborators'

export async function fetchCollaborators(params: {
  search?: string
  include_inactive?: boolean
  page?: number
  page_size?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}): Promise<CollaboratorListResponse> {
  const { data } = await apiClient.get<CollaboratorListResponse>(`${BASE}/`, { params })
  return data
}

export async function fetchCollaborator(id: number): Promise<Collaborator> {
  const { data } = await apiClient.get<Collaborator>(`${BASE}/${id}`)
  return data
}

export async function createCollaborator(body: CollaboratorCreate): Promise<Collaborator> {
  const { data } = await apiClient.post<Collaborator>(`${BASE}/`, body)
  return data
}

export async function updateCollaborator(id: number, body: CollaboratorUpdate): Promise<Collaborator> {
  const { data } = await apiClient.patch<Collaborator>(`${BASE}/${id}`, body)
  return data
}

export async function deleteCollaborator(id: number): Promise<Collaborator> {
  const { data } = await apiClient.delete<Collaborator>(`${BASE}/${id}`)
  return data
}

export async function reactivateCollaborator(id: number): Promise<Collaborator> {
  const { data } = await apiClient.post<Collaborator>(`${BASE}/${id}/reactivate`)
  return data
}

export async function mergeCollaborators(body: MergeRequest): Promise<MergeResponse> {
  const { data } = await apiClient.post<MergeResponse>(`${BASE}/merge`, body)
  return data
}

export async function exportCollaboratorsCSV(include_inactive = true): Promise<void> {
  const { data } = await apiClient.get(`${BASE}/export`, {
    params: { include_inactive },
    responseType: 'blob',
  })
  const url = URL.createObjectURL(data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'collaborators.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export async function importCollaboratorsCSV(file: File): Promise<CSVImportResponse> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post<CSVImportResponse>(`${BASE}/import`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}
