"use client"

import * as React from "react"
import { Filter, X, Star, Calendar, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/Badge"
import { PeriodFilter, type PeriodPreset } from "@/components/ui/period-filter"
import type { DateRange } from "react-day-picker"

export interface AdvancedFilters {
  rating?: number[]
  source?: string[]
  collaborator?: string[]
  period?: PeriodPreset | DateRange
}

interface AdvancedFiltersProps {
  filters: AdvancedFilters
  onFiltersChange: (filters: AdvancedFilters) => void
  availableSources?: string[]
  availableCollaborators?: string[]
  className?: string
}

const ratingOptions = [
  { value: 5, label: "5 estrelas", icon: "⭐⭐⭐⭐⭐" },
  { value: 4, label: "4 estrelas", icon: "⭐⭐⭐⭐" },
  { value: 3, label: "3 estrelas", icon: "⭐⭐⭐" },
  { value: 2, label: "2 estrelas", icon: "⭐⭐" },
  { value: 1, label: "1 estrela", icon: "⭐" },
]

const sourceOptions = [
  { value: "google", label: "Google" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "website", label: "Website" },
]

const defaultCollaborators = [
  "Ana Sophia",
  "Karen Figueiredo",
  "Letícia Andreza",
  "Pedro Santos",
  "Maria Oliveira"
]

export function AdvancedFiltersComponent({
  filters,
  onFiltersChange,
  availableSources = sourceOptions.map(s => s.value),
  availableCollaborators = defaultCollaborators,
  className
}: AdvancedFiltersProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [tempFilters, setTempFilters] = React.useState<AdvancedFilters>(filters)

  React.useEffect(() => {
    setTempFilters(filters)
  }, [filters])

  const handleRatingToggle = (rating: number) => {
    const currentRatings = tempFilters.rating || []
    const newRatings = currentRatings.includes(rating)
      ? currentRatings.filter(r => r !== rating)
      : [...currentRatings, rating]

    setTempFilters(prev => ({
      ...prev,
      rating: newRatings.length > 0 ? newRatings : undefined
    }))
  }

  const handleSourceToggle = (source: string) => {
    const currentSources = tempFilters.source || []
    const newSources = currentSources.includes(source)
      ? currentSources.filter(s => s !== source)
      : [...currentSources, source]

    setTempFilters(prev => ({
      ...prev,
      source: newSources.length > 0 ? newSources : undefined
    }))
  }

  const handleCollaboratorToggle = (collaborator: string) => {
    const currentCollaborators = tempFilters.collaborator || []
    const newCollaborators = currentCollaborators.includes(collaborator)
      ? currentCollaborators.filter(c => c !== collaborator)
      : [...currentCollaborators, collaborator]

    setTempFilters(prev => ({
      ...prev,
      collaborator: newCollaborators.length > 0 ? newCollaborators : undefined
    }))
  }

  const handlePeriodChange = (period: PeriodPreset | DateRange) => {
    setTempFilters(prev => ({
      ...prev,
      period
    }))
  }

  const handleApply = () => {
    onFiltersChange(tempFilters)
    setIsOpen(false)
  }

  const handleClear = () => {
    const emptyFilters: AdvancedFilters = {}
    setTempFilters(emptyFilters)
    onFiltersChange(emptyFilters)
  }

  const getActiveFiltersCount = () => {
    let count = 0
    if (filters.rating?.length) count++
    if (filters.source?.length) count++
    if (filters.collaborator?.length) count++
    if (filters.period) count++
    return count
  }

  const hasActiveFilters = getActiveFiltersCount() > 0

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant={hasActiveFilters ? "default" : "outline"}
          size="sm"
          className={className}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filtros
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-2 h-5 w-5 rounded-full p-0 text-xs">
              {getActiveFiltersCount()}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros Avançados
          </SheetTitle>
          <SheetDescription>
            Refine sua busca aplicando múltiplos filtros às avaliações
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Filtro por Rating */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              <h4 className="font-medium">Avaliação</h4>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {ratingOptions.map((option) => {
                const isSelected = tempFilters.rating?.includes(option.value) || false
                return (
                  <Button
                    key={option.value}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleRatingToggle(option.value)}
                    className="justify-start"
                  >
                    <span className="mr-2">{option.icon}</span>
                    {option.label}
                  </Button>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Filtro por Fonte */}
          <div className="space-y-3">
            <h4 className="font-medium">Fonte</h4>
            <div className="grid grid-cols-2 gap-2">
              {sourceOptions.map((option) => {
                const isSelected = tempFilters.source?.includes(option.value) || false
                return (
                  <Button
                    key={option.value}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleSourceToggle(option.value)}
                    className="justify-start"
                  >
                    {option.label}
                  </Button>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Filtro por Colaborador */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <h4 className="font-medium">Colaborador</h4>
            </div>
            <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
              {availableCollaborators.map((collaborator) => {
                const isSelected = tempFilters.collaborator?.includes(collaborator) || false
                return (
                  <Button
                    key={collaborator}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleCollaboratorToggle(collaborator)}
                    className="justify-start text-left"
                  >
                    {collaborator}
                  </Button>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Filtro por Período */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <h4 className="font-medium">Período</h4>
            </div>
            <PeriodFilter
              value={tempFilters.period || "30d"}
              onChange={handlePeriodChange}
            />
          </div>
        </div>

        <div className="absolute bottom-6 left-6 right-6 flex gap-2">
          <Button
            variant="outline"
            onClick={handleClear}
            className="flex-1"
            disabled={!hasActiveFilters}
          >
            <X className="mr-2 h-4 w-4" />
            Limpar Filtros
          </Button>
          <Button onClick={handleApply} className="flex-1">
            Aplicar Filtros
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}


