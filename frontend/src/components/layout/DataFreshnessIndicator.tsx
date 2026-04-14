import { Clock } from 'lucide-react'
import { Tooltip } from '@base-ui/react/tooltip'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { cn } from '@/lib/utils'
import { useDataStatus } from '@/hooks/use-metrics'

export interface DataFreshnessIndicatorProps {
  className?: string
}

function formatShort(iso: string | null): string {
  if (!iso) return '—'
  try {
    return format(new Date(iso), "dd 'de' MMM", { locale: ptBR })
  } catch {
    return '—'
  }
}

function formatLong(iso: string | null, fallback = 'Nunca'): string {
  if (!iso) return fallback
  try {
    return format(new Date(iso), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", {
      locale: ptBR,
    })
  } catch {
    return fallback
  }
}

function freshnessTone(days: number | null | undefined): string {
  if (days == null) return 'text-muted-foreground'
  if (days > 90) return 'text-red-600'
  if (days > 30) return 'text-amber-600'
  return 'text-muted-foreground'
}

/**
 * Persistent widget that surfaces how fresh the review data is.
 * Rendered in the sidebar/chrome, so it must NEVER break the layout:
 * errors collapse silently to `null`, loading renders a thin skeleton.
 */
export function DataFreshnessIndicator({
  className,
}: DataFreshnessIndicatorProps) {
  const { data, isLoading, isError } = useDataStatus()

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5',
          className,
        )}
        aria-hidden
      >
        <span className="size-3.5 animate-pulse rounded-full bg-muted" />
        <span className="h-3 w-24 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (isError || !data) {
    return null
  }

  const tone = freshnessTone(data.days_since_last_review)
  const shortLabel = formatShort(data.last_review_date)
  const fullReview = formatLong(data.last_review_date, '—')
  const fullSync = formatLong(data.last_collection_run, 'Nunca')

  return (
    <Tooltip.Provider delay={200}>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={(props) => (
            <button
              type="button"
              {...props}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium tabular-nums transition-colors',
                'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tone,
                className,
              )}
              aria-label={`Dados de ${fullReview}. Última sincronização: ${fullSync}.`}
            >
              <Clock size={14} aria-hidden />
              <span className="truncate">Dados de {shortLabel}</span>
            </button>
          )}
        />
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={6}>
            <Tooltip.Popup
              className={cn(
                'z-50 max-w-xs rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg outline-none',
                'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150',
              )}
            >
              <p className="font-medium">Última avaliação: {fullReview}</p>
              <p className="mt-0.5 text-muted-foreground">
                Última sincronização: {fullSync}
              </p>
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
