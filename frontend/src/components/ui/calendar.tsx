import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DayPicker,
  type DayPickerProps,
} from 'react-day-picker'
import 'react-day-picker/style.css'
import { ptBR } from 'date-fns/locale'

import { cn } from '@/lib/utils'

/**
 * Thin wrapper around react-day-picker v9 with Tailwind classNames that
 * inherit the shadcn token palette (background / muted / accent / ring).
 *
 * Not the full shadcn template — we only use `range` mode, so only the
 * classNames touched by that variant are overridden. If other modes are
 * added later, extend `classNames` accordingly.
 */
export type CalendarProps = DayPickerProps

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        // F1 (phase 3.8): `months` is the positioning context for the
        // absolute `nav`. The caption must NOT create its own positioning
        // context or it swallows pointer events on the ◀ ▶ buttons.
        months: 'relative flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-3',
        month_caption:
          'flex justify-center pt-1 items-center text-sm font-medium pointer-events-none',
        caption_label: 'text-sm font-medium capitalize',
        nav: 'absolute top-1 right-1 z-10 flex items-center gap-1 pointer-events-auto',
        button_previous: cn(
          'inline-flex size-7 items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors pointer-events-auto',
        ),
        button_next: cn(
          'inline-flex size-7 items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors pointer-events-auto',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'text-muted-foreground rounded-md w-9 font-normal text-[0.75rem] uppercase',
        week: 'flex w-full mt-1',
        day: cn(
          'relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20',
        ),
        day_button: cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-normal tabular-nums transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ),
        range_start:
          'bg-primary text-primary-foreground rounded-l-md [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
        range_end:
          'bg-primary text-primary-foreground rounded-r-md [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
        range_middle:
          'bg-muted text-foreground rounded-none [&>button]:rounded-none [&>button]:hover:bg-muted',
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
        today: '[&>button]:ring-1 [&>button]:ring-ring',
        outside: 'text-muted-foreground/50',
        disabled: 'text-muted-foreground/40 pointer-events-none',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass }) =>
          orientation === 'left' ? (
            <ChevronLeft className={cn('size-4', chevronClass)} />
          ) : (
            <ChevronRight className={cn('size-4', chevronClass)} />
          ),
      }}
      {...props}
    />
  )
}
