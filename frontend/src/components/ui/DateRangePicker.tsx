import { useEffect, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { CalendarDays } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'

import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'

export interface DateRangeValue {
  from: Date | null
  to: Date | null
}

export interface DateRangePickerProps {
  value: DateRangeValue
  /**
   * Commit-only callback — fires exclusively when the user clicks Aplicar
   * with both endpoints chosen. No streaming updates, so parents can wire
   * `value` directly into data-fetching query keys without triggering a
   * refetch on every intermediate click.
   */
  onApply: (range: DateRangeValue) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /**
   * Forces the popover open on mount when `autoOpen` flips to true. Used by
   * parents that want "select Personalizado → popover opens" UX without
   * requiring a second click on the trigger.
   */
  autoOpen?: boolean
}

function formatTrigger(
  value: DateRangeValue,
  placeholder: string,
): string {
  if (value.from && value.to) {
    const sameYear = value.from.getFullYear() === value.to.getFullYear()
    const fromFmt = sameYear ? 'dd MMM' : 'dd MMM yyyy'
    return `${format(value.from, fromFmt, { locale: ptBR })} – ${format(
      value.to,
      'dd MMM yyyy',
      { locale: ptBR },
    )}`
  }
  return placeholder
}

/**
 * Range date picker built on base-ui Popover + react-day-picker Calendar.
 *
 * Two-stage commit model: calendar clicks update a local `draft` only.
 * The parent's `onApply` fires exclusively when the user clicks Aplicar
 * with both endpoints set. Cancel/close-without-apply discards the draft.
 * This prevents the dashboard from refetching once per calendar click
 * while the user is still mid-selection.
 */
export function DateRangePicker({
  value,
  onApply,
  placeholder = 'Selecionar período',
  disabled = false,
  className,
  autoOpen = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRangeValue>(value)

  // When the popover opens, seed the draft from the current applied value
  // so reopening after a prior commit shows the last choice instead of a
  // blank calendar. Also reset when parent updates `value` externally.
  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  // Auto-open handshake: parent flips `autoOpen` to true the moment the
  // user picks "Personalizado" in the Select. One-shot — parent resets the
  // flag after the popover closes.
  useEffect(() => {
    if (autoOpen) setOpen(true)
  }, [autoOpen])

  const triggerLabel = formatTrigger(value, placeholder)
  const hasValue = value.from != null && value.to != null

  const handleSelect = (range: DateRange | undefined) => {
    setDraft({
      from: range?.from ?? null,
      to: range?.to ?? null,
    })
  }

  const canApply = draft.from != null && draft.to != null

  const handleApply = () => {
    if (!canApply) return
    onApply({ from: draft.from, to: draft.to })
    setOpen(false)
  }

  const handleCancel = () => {
    setDraft(value)
    setOpen(false)
  }

  const draftFooter = (() => {
    if (draft.from && draft.to) {
      const sameYear = draft.from.getFullYear() === draft.to.getFullYear()
      const fromFmt = sameYear ? 'dd MMM' : 'dd MMM yyyy'
      return `${format(draft.from, fromFmt, { locale: ptBR })} – ${format(
        draft.to,
        'dd MMM yyyy',
        { locale: ptBR },
      )}`
    }
    if (draft.from) {
      return `${format(draft.from, 'dd MMM yyyy', { locale: ptBR })} – selecione a data final`
    }
    return 'Selecione a data inicial e a data final'
  })()

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={disabled}
        aria-label="Selecionar período"
        className={cn(
          'inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !hasValue && 'text-muted-foreground',
          className,
        )}
      >
        <CalendarDays size={14} aria-hidden />
        <span className="truncate">{triggerLabel}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start">
          <Popover.Popup
            className={cn(
              'z-50 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none',
              'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150',
            )}
          >
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={{
                from: draft.from ?? undefined,
                to: draft.to ?? undefined,
              }}
              onSelect={handleSelect}
              defaultMonth={draft.from ?? value.from ?? undefined}
            />
            <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-3 py-2.5">
              <span
                className={cn(
                  'text-xs font-medium',
                  canApply ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {draftFooter}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className={cn(
                    'inline-flex h-8 cursor-pointer items-center rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors',
                    'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!canApply}
                  className={cn(
                    'inline-flex h-8 cursor-pointer items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors',
                    'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  Aplicar
                </button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
