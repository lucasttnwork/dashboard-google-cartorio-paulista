import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import type { RatingBucket, RatingDistribution } from '@/types/metrics'

export interface RatingHistogramProps {
  distribution: RatingDistribution
  /**
   * Optional override for the denominator of percent calculation.
   * Defaults to the sum of `distribution` values.
   */
  total?: number
  /** Compact variant: thinner bars, no count labels. */
  compact?: boolean
  className?: string
}

// Descending order — 5★ on top matches how reviewers scan a histogram.
const ROWS: RatingBucket[] = ['5', '4', '3', '2', '1']

/**
 * Row color coding lines up with `ratingBorderClass` used on review cards.
 * 5★ & 4★ read as "green/positive", 3★ amber, 1-2★ red, so the histogram
 * becomes a quick scent test for the brand health of a period.
 */
const ROW_CLASSES: Record<RatingBucket, string> = {
  '5': 'bg-emerald-500',
  '4': 'bg-emerald-400',
  '3': 'bg-amber-500',
  '2': 'bg-red-400',
  '1': 'bg-red-500',
}

export function RatingHistogram({
  distribution,
  total,
  compact = false,
  className,
}: RatingHistogramProps) {
  // Derive denominator from props — no useMemo needed for O(5) work.
  const sum =
    total ??
    (distribution[1] ?? 0) +
      (distribution[2] ?? 0) +
      (distribution[3] ?? 0) +
      (distribution[4] ?? 0) +
      (distribution[5] ?? 0)

  const safeTotal = sum > 0 ? sum : 1

  return (
    <ul
      className={cn('flex w-full flex-col gap-1.5', className)}
      aria-label="Distribuição de notas"
    >
      {ROWS.map((bucket) => {
        const count = distribution[bucket] ?? 0
        const pct = sum > 0 ? (count / safeTotal) * 100 : 0
        const pctLabel = pct.toLocaleString('pt-BR', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })
        const title = `${bucket}★: ${formatNumber(count)} avaliações (${pctLabel}%)`

        return (
          <li
            key={bucket}
            className="flex items-center gap-2"
            title={title}
            aria-label={title}
          >
            <span
              className={cn(
                'w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground',
              )}
            >
              {bucket}★
            </span>
            <span
              className={cn(
                'relative flex-1 overflow-hidden rounded-full bg-muted',
                compact ? 'h-1.5' : 'h-2.5',
              )}
            >
              <span
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out',
                  ROW_CLASSES[bucket],
                )}
                style={{ width: `${pct}%` }}
              />
            </span>
            {!compact && (
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {formatNumber(count)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
