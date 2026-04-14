import type { TrendsGranularity } from '@/types/metrics'

const DAY_MS = 86_400_000

/**
 * Decides which bucket size the trend series should use for a given
 * time window. Ranges of 60 days or less switch to per-day buckets; the
 * preset-relative `months` path stays monthly because "últimos 3 meses"
 * covers ~90 days and looks noisy as a daily series.
 */
export function pickGranularity(params: {
  months?: number
  dateFrom?: string
  dateTo?: string
}): TrendsGranularity {
  const { months, dateFrom, dateTo } = params
  if (dateFrom && dateTo) {
    const from = new Date(dateFrom).getTime()
    const to = new Date(dateTo).getTime()
    if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 'month'
    const diffDays = Math.ceil((to - from) / DAY_MS)
    return diffDays <= 60 ? 'day' : 'month'
  }
  if (months != null && months <= 2) return 'day'
  return 'month'
}
