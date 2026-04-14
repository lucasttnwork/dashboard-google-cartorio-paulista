import { useState } from 'react'
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
  onChange: (range: DateRangeValue) => void
  placeholder?: string
  disabled?: boolean
  className?: string
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
  if (value.from && !value.to) {
    return `${format(value.from, 'dd MMM yyyy', { locale: ptBR })} – Selecione a data final`
  }
  return placeholder
}

/**
 * Range date picker built on base-ui Popover + react-day-picker Calendar.
 *
 * Controlled component — the caller owns `value` and `onChange`. The
 * popover auto-closes as soon as both `from` and `to` are selected so
 * the user never has to hunt for a close button.
 */
export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Selecionar período',
  disabled = false,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  const triggerLabel = formatTrigger(value, placeholder)
  const hasValue = value.from != null && value.to != null

  const handleSelect = (range: DateRange | undefined) => {
    const next: DateRangeValue = {
      from: range?.from ?? null,
      to: range?.to ?? null,
    }
    onChange(next)
    // Auto-close on complete range selection.
    if (next.from && next.to) {
      setOpen(false)
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={disabled}
        className={cn(
          'inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-colors',
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
                from: value.from ?? undefined,
                to: value.to ?? undefined,
              }}
              onSelect={handleSelect}
              defaultMonth={value.from ?? undefined}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
