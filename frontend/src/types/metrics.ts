export interface MetricsOverview {
  total_reviews: number
  avg_rating: number
  five_star_pct: number
  one_star_pct: number
  total_with_comment: number
  total_with_reply: number
  total_enotariado: number
  avg_rating_enotariado: number | null
  total_collaborators_active: number
  total_mentions: number
  period_start: string
  period_end: string
}

export interface MonthData {
  month: string
  total_reviews: number
  avg_rating: number
  reviews_enotariado: number
  avg_rating_enotariado: number | null
}

export interface TrendsData {
  months: MonthData[]
}

export interface CollaboratorMonthData {
  month: string
  mentions: number
  avg_rating: number | null
}

export interface CollaboratorMention {
  collaborator_id: number
  full_name: string
  is_active: boolean
  total_mentions: number
  avg_rating_mentioned: number | null
  monthly: CollaboratorMonthData[]
}

export interface CollaboratorMentionsData {
  collaborators: CollaboratorMention[]
}
