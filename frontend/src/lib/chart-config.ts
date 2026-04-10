/**
 * Chart design tokens — "startup premium, Apple sobriety".
 * Single source of truth for all recharts colors across pages.
 */

export const CHART_COLORS = {
  /** Primary blue — review count bars */
  blue: '#3b82f6',
  /** Warm amber — average rating line */
  amber: '#f59e0b',
  /** Green — e-notariado / positive indicators */
  green: '#10b981',
  /** Red — negative indicators */
  red: '#ef4444',
  /** Neutral gray — secondary data */
  gray: '#6b7280',
  /** Light gray — grid lines, axis */
  gridLine: '#e5e7eb',
  /** Muted blue for area fills */
  blueFill: 'rgba(59, 130, 246, 0.08)',
  /** Muted amber for area fills */
  amberFill: 'rgba(245, 158, 11, 0.08)',
} as const

/** Rating color coding for review cards (border-left) */
export function ratingColor(rating: number | null): string {
  if (rating == null) return CHART_COLORS.gray
  if (rating >= 4) return CHART_COLORS.green
  if (rating === 3) return CHART_COLORS.amber
  return CHART_COLORS.red
}

/** Rating color as Tailwind class for border-left */
export function ratingBorderClass(rating: number | null): string {
  if (rating == null) return 'border-l-gray-400'
  if (rating >= 4) return 'border-l-emerald-500'
  if (rating === 3) return 'border-l-amber-500'
  return 'border-l-red-500'
}
