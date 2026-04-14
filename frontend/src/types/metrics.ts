export type RatingBucket = '1' | '2' | '3' | '4' | '5'
export type RatingDistribution = Record<RatingBucket, number>

export interface PreviousPeriod {
  total_reviews: number
  avg_rating: number
  five_star_pct: number
  one_star_pct: number
  reply_rate_pct: number
  total_mentions: number
  period_start: string
  period_end: string
}

export interface MetricsOverview {
  total_reviews: number
  avg_rating: number
  five_star_pct: number
  one_star_pct: number
  total_with_comment: number
  total_with_reply: number
  reply_rate_pct: number
  total_enotariado: number
  avg_rating_enotariado: number | null
  total_collaborators_active: number
  total_mentions: number
  rating_distribution: RatingDistribution
  period_start: string
  period_end: string
  previous_period: PreviousPeriod | null
}

export type TrendsGranularity = 'month' | 'day'

export interface MonthData {
  month?: string
  day?: string
  total_reviews: number
  avg_rating: number
  reviews_enotariado: number
  avg_rating_enotariado: number | null
  reply_rate_pct: number
}

export interface DataStatus {
  last_review_date: string | null
  last_collection_run: string | null
  total_reviews: number
  days_since_last_review: number | null
}

export interface TrendsData {
  months: MonthData[]
  granularity?: TrendsGranularity
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

export interface MyPerformance {
  linked: boolean
  collaborator_id: number | null
  full_name: string | null
  total_mentions: number
  avg_rating: number | null
  ranking: number | null
  total_collaborators: number
  monthly: CollaboratorMonthData[]
  recent_reviews: {
    review_id: string
    rating: number | null
    comment: string
    reviewer_name: string
    create_time: string | null
  }[]
}

export interface SystemUser {
  id: string
  email: string
  role: string
  is_active: boolean
}
