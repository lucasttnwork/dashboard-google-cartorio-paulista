export interface Collaborator {
  id: number
  full_name: string
  aliases: string[]
  department: string | null
  position: string | null
  is_active: boolean
  mention_count: number
  created_at: string
  updated_at: string
}

export interface CollaboratorListResponse {
  items: Collaborator[]
  total: number
  page: number
  page_size: number
}

export interface CollaboratorCreate {
  full_name: string
  aliases?: string[]
  department?: string | null
  position?: string | null
}

export interface CollaboratorUpdate {
  full_name?: string
  aliases?: string[]
  department?: string | null
  position?: string | null
  is_active?: boolean
}

export interface MergeRequest {
  source_id: number
  target_id: number
}

export interface MergeResponse {
  target_id: number
  mentions_transferred: number
  aliases_added: string[]
  source_deactivated: boolean
}

export interface CSVImportResponse {
  created: number
  updated: number
  errors: Array<{ row: number; error: string }>
}
