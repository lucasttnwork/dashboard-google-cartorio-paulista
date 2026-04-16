import { apiClient } from './client'

export interface DatasetUploadResponse {
  total_processed: number
  new_reviews: number
  updated_reviews: number
  collection_run_id: number
  total_in_database: number
}

export interface CollectionRun {
  id: number
  run_type: string
  status: string
  started_at: string | null
  completed_at: string | null
  reviews_found: number
  reviews_new: number
  reviews_updated: number
}

export async function uploadDataset(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<DatasetUploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post<DatasetUploadResponse>(
    '/api/v1/dataset-upload/',
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300_000,
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total))
        }
      },
    },
  )
  return data
}

export async function fetchCollectionRuns(): Promise<CollectionRun[]> {
  const { data } = await apiClient.get<CollectionRun[]>(
    '/api/v1/dataset-upload/history',
  )
  return data
}
