"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface MonthlyNavigationProps {
  availableMonths: string[]
  currentMonth: string | null
  onMonthChange: (month: string) => void
  isLoading?: boolean
}

export function MonthlyNavigation({
  availableMonths,
  currentMonth,
  onMonthChange,
  isLoading = false
}: MonthlyNavigationProps) {
  const [selectedMonth, setSelectedMonth] = React.useState<string>(
    currentMonth || availableMonths[0] || ''
  )

  React.useEffect(() => {
    if (currentMonth) {
      setSelectedMonth(currentMonth)
    }
  }, [currentMonth])

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month)
    onMonthChange(month)
  }

  const currentMonthIndex = availableMonths.findIndex(month => month === selectedMonth)
  const hasPrevious = currentMonthIndex > 0
  const hasNext = currentMonthIndex < availableMonths.length - 1

  const goToPrevious = () => {
    if (hasPrevious) {
      const prevMonth = availableMonths[currentMonthIndex - 1]
      handleMonthChange(prevMonth)
    }
  }

  const goToNext = () => {
    if (hasNext) {
      const nextMonth = availableMonths[currentMonthIndex + 1]
      handleMonthChange(nextMonth)
    }
  }

  const formatMonthDisplay = (monthStr: string) => {
    if (!monthStr) return 'Selecione um mês'

    try {
      const [year, month] = monthStr.split('-').map(Number)
      const date = new Date(year, month - 1, 1)
      return format(date, 'MMMM yyyy', { locale: ptBR })
    } catch {
      return monthStr
    }
  }

  const getMonthStats = (monthStr: string) => {
    // Placeholder para estatísticas do mês - seria carregado via API
    return {
      totalReviews: 0,
      avgRating: 0
    }
  }

  if (availableMonths.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Navegação Mensal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Nenhum dado mensal disponível</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Navegação Mensal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Navegação principal */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevious}
            disabled={!hasPrevious || isLoading}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>

          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold">
              {formatMonthDisplay(selectedMonth)}
            </span>
            <span className="text-xs text-muted-foreground">
              {selectedMonth}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={goToNext}
            disabled={!hasNext || isLoading}
            className="flex items-center gap-2"
          >
            Próximo
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Seletor de mês */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Selecionar mês:</label>
          <select
            value={selectedMonth}
            onChange={(e) => handleMonthChange(e.target.value)}
            disabled={isLoading}
            className="w-full p-2 border rounded-md bg-background text-sm"
          >
            {availableMonths.map((month) => (
              <option key={month} value={month}>
                {formatMonthDisplay(month)}
              </option>
            ))}
          </select>
        </div>

        {/* Lista rápida de meses */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Meses disponíveis:</label>
          <div className="grid grid-cols-3 gap-2">
            {availableMonths.slice(0, 6).map((month) => (
              <Button
                key={month}
                variant={selectedMonth === month ? "default" : "outline"}
                size="sm"
                onClick={() => handleMonthChange(month)}
                disabled={isLoading}
                className="text-xs"
              >
                {format(new Date(month + '-01'), 'MMM yy', { locale: ptBR })}
              </Button>
            ))}
          </div>
          {availableMonths.length > 6 && (
            <p className="text-xs text-muted-foreground">
              E mais {availableMonths.length - 6} meses...
            </p>
          )}
        </div>

        {/* Estatísticas rápidas do mês atual */}
        {selectedMonth && (
          <div className="pt-2 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Avaliações:</span>
              <span className="font-medium">{getMonthStats(selectedMonth).totalReviews}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Média:</span>
              <span className="font-medium">{getMonthStats(selectedMonth).avgRating}★</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
