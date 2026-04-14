import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDecimal } from '@/lib/format'

export interface DeltaBadgeProps {
  /** Raw delta value. `null`/`undefined` render as neutral "Estável". */
  value: number | null | undefined
  /** Optional suffix appended after the number ("%", "pts", etc.). */
  suffix?: string
  /** Decimal places (default: 2). */
  decimals?: number
  className?: string
}

/**
 * Inline badge that renders the direction of a KPI delta.
 *
 * Pure function — state is derived from props, no effects, no memoization.
 * Uses the U+2212 MINUS SIGN for negative values (not ASCII hyphen) so
 * tabular-nums alignment stays consistent with positive values.
 */
export function DeltaBadge({
  value,
  suffix = '',
  decimals = 2,
  className,
}: DeltaBadgeProps) {
  // Neutral states collapse into one branch — no value to format.
  if (value == null) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground',
          className,
        )}
        aria-label="Sem dados de comparação"
      >
        <Minus size={14} aria-hidden />
        <span>Estável</span>
      </span>
    )
  }

  if (value === 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground',
          className,
        )}
        aria-label="Sem alteração"
      >
        <Minus size={14} aria-hidden />
        <span>Sem alteração</span>
      </span>
    )
  }

  const isPositive = value > 0
  const magnitude = formatDecimal(Math.abs(value), decimals)
  // U+2212 MINUS — visually distinct from the Lucide icon's ASCII hyphen.
  const sign = isPositive ? '+' : '\u2212'
  const label = isPositive
    ? `Aumento de ${magnitude}${suffix}`
    : `Queda de ${magnitude}${suffix}`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium tabular-nums',
        isPositive ? 'text-emerald-600' : 'text-red-600',
        className,
      )}
      aria-label={label}
    >
      {isPositive ? (
        <ArrowUp size={14} aria-hidden />
      ) : (
        <ArrowDown size={14} aria-hidden />
      )}
      <span>
        {sign}
        {magnitude}
        {suffix}
      </span>
    </span>
  )
}
