export interface ReviewOut {
  review_id: string
  location_id: string | null
  rating: number | null
  comment: string | null
  reviewer_name: string | null
  is_anonymous: boolean | null
  create_time: string | null
  update_time: string | null
  reply_text: string | null
  reply_time: string | null
  review_url: string | null
  is_local_guide: boolean | null
  sentiment: string | null
  is_enotariado: boolean | null
  collaborator_names: string[]
}

export interface MentionOut {
  collaborator_id: number
  collaborator_name: string
  mention_snippet: string | null
  match_score: number | null
}

export interface ReviewDetailOut extends ReviewOut {
  original_language: string | null
  translated_text: string | null
  response_text: string | null
  response_time: string | null
  reviewer_id: string | null
  reviewer_url: string | null
  reviewer_photo_url: string | null
  collection_source: string | null
  processed_at: string | null
  mentions: MentionOut[]
}

export interface ReviewListResponse {
  items: ReviewOut[]
  next_cursor: string | null
  has_more: boolean
  total: number
}
