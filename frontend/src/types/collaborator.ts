export interface Collaborator {
  id: number
  full_name: string
  aliases: string[]
  department: string | null
  position: string | null
  is_active: boolean
  user_id: string | null
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
  user_id?: string | null
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

// ---------------------------------------------------------------------------
// Phase 3.7 — Collaborator profile page
// ---------------------------------------------------------------------------

import type {
  CollaboratorMonthData,
  RatingDistribution,
} from '@/types/metrics'

export interface CollaboratorReview {
  review_id: string
  rating: number | null
  comment: string | null
  reviewer_name: string
  create_time: string | null
  mention_snippet: string | null
  match_score: number | null
}

export interface CollaboratorProfile {
  // Basic
  id: number
  full_name: string
  aliases: string[]
  department: string | null
  position: string | null
  is_active: boolean

  // All-time KPIs
  total_mentions: number
  avg_rating: number | null
  ranking: number | null
  total_collaborators_active: number

  // 6m vs prev-6m (for delta)
  mentions_last_6m: number
  mentions_prev_6m: number
  avg_rating_last_6m: number | null
  avg_rating_prev_6m: number | null

  // Distribution / series / recent
  rating_distribution: RatingDistribution
  monthly: CollaboratorMonthData[]
  recent_reviews: CollaboratorReview[]
}
