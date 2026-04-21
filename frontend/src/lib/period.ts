import type { TrendsGranularity } from '@/types/metrics'

const DAY_MS = 86_400_000

/**
 * Format a `Date` as `YYYY-MM-DD` using the LOCAL calendar. `toISOString`
 * flips the wall-clock day near midnight in any timezone west of UTC
 * (America/Sao_Paulo at 22:00 BRT → 01:00 next-day UTC → wrong ISO), so
 * we never use it for date-only serialisation.
 */
export function isoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/**
 * Parse a date string as a local-midnight `Date`. Accepts both bare
 * `YYYY-MM-DD` (URL params, bucket keys) and full ISO datetimes such as
 * `2026-04-15T00:00:00+00:00` (backend payloads). In both cases we take
 * the date portion literally and construct a local-midnight Date.
 *
 * Why: `new Date('2026-04-15')` parses the date-only form as UTC, so it
 * renders one day early in any negative-offset timezone (BR: 14 abr
 * 21:00 local). And `new Date('2026-04-15T00:00:00+00:00')` does the
 * same — the UTC-midnight instant is 14 abr 21:00 BRT. For day-bucket
 * display we want the wall-clock day the server means, not the
 * timezone-shifted instant.
 */
export function parseLocalDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = new Date(year, month - 1, day)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Decides which bucket size the trend series should use for a given
 * time window. Ranges of 62 days or less switch to per-day buckets so
 * the "Últimos 2 meses" preset (max span 31+31 = 62 days in Jan+Dec)
 * always resolves to daily. Presets of 3+ months stay monthly because
 * "últimos 3 meses" covers ~90 days and looks noisy as a daily series.
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
    return diffDays <= 62 ? 'day' : 'month'
  }
  if (months != null && months <= 2) return 'day'
  return 'month'
}
