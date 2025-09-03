"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type PeriodPreset = "7d" | "30d" | "90d" | "custom"

interface PeriodFilterProps {
  value: PeriodPreset | DateRange
  onChange: (value: PeriodPreset | DateRange) => void
  className?: string
}

const periodPresets = [
  { value: "7d" as const, label: "Últimos 7 dias" },
  { value: "30d" as const, label: "Últimos 30 dias" },
  { value: "90d" as const, label: "Últimos 90 dias" },
  { value: "custom" as const, label: "Período personalizado" },
]

export function PeriodFilter({ value, onChange, className }: PeriodFilterProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const getDisplayValue = () => {
    if (typeof value === "string") {
      const preset = periodPresets.find(p => p.value === value)
      return preset?.label || "Selecionar período"
    }

    if (value.from && value.to) {
      return `${format(value.from, "dd/MM/yyyy", { locale: ptBR })} - ${format(value.to, "dd/MM/yyyy", { locale: ptBR })}`
    }

    return "Selecionar período"
  }

  const handlePresetChange = (preset: PeriodPreset) => {
    if (preset === "custom") {
      setIsOpen(true)
      return
    }

    onChange(preset)
    setIsOpen(false)
  }

  const handleDateRangeChange = (dateRange: DateRange | undefined) => {
    if (dateRange?.from && dateRange?.to) {
      onChange(dateRange)
      setIsOpen(false)
    }
  }

  const isCustomPeriod = typeof value === "object"

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select
        value={isCustomPeriod ? "custom" : (value as string)}
        onValueChange={handlePresetChange}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Selecionar período" />
        </SelectTrigger>
        <SelectContent>
          {periodPresets.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isCustomPeriod && (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[240px] justify-start text-left font-normal",
                !value && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {getDisplayValue()}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={isCustomPeriod ? value.from : new Date()}
              selected={isCustomPeriod ? value : undefined}
              onSelect={handleDateRangeChange}
              numberOfMonths={2}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
