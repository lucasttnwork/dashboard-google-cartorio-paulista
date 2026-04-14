import { X, Users } from 'lucide-react'
import { toast } from 'sonner'

import { toTitleCase } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

export interface CollaboratorOption {
  collaborator_id: number
  full_name: string
}

interface Props {
  options: CollaboratorOption[]
  selected: number[]
  onChange: (next: number[]) => void
  maxSelection?: number
  isLoading?: boolean
}

/**
 * Multi-select de colaboradores usado apenas pela ReviewsPage.
 * - Seleção máxima configurável (padrão 3).
 * - Adiciona via Select; remove via chips com botão "X".
 * - Exibe os nomes em Title Case PT-BR.
 */
export function CollaboratorMultiSelect({
  options,
  selected,
  onChange,
  maxSelection = 3,
  isLoading = false,
}: Props) {
  const selectedSet = new Set(selected)
  const atLimit = selected.length >= maxSelection

  const handleSelect = (value: string | null) => {
    if (value == null || value === '') return
    const id = Number(value)
    if (Number.isNaN(id)) return
    if (selectedSet.has(id)) return
    if (atLimit) {
      toast.info(`Máximo de ${maxSelection} colaboradores por filtro.`)
      return
    }
    onChange([...selected, id])
  }

  const handleRemove = (id: number) => {
    onChange(selected.filter((x) => x !== id))
  }

  const selectedOptions = selected
    .map((id) => options.find((o) => o.collaborator_id === id))
    .filter((o): o is CollaboratorOption => !!o)

  return (
    <div className="flex flex-col gap-2">
      <Select
        value=""
        onValueChange={handleSelect}
        disabled={isLoading || options.length === 0}
      >
        <SelectTrigger className="w-full sm:w-56">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="size-4" />
            {atLimit
              ? `Limite de ${maxSelection} atingido`
              : 'Todos os colaboradores'}
          </span>
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              Nenhum colaborador disponível.
            </div>
          ) : (
            options.map((opt) => {
              const isSelected = selectedSet.has(opt.collaborator_id)
              return (
                <SelectItem
                  key={opt.collaborator_id}
                  value={String(opt.collaborator_id)}
                  disabled={isSelected || (atLimit && !isSelected)}
                >
                  {toTitleCase(opt.full_name)}
                </SelectItem>
              )
            })
          )}
        </SelectContent>
      </Select>

      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((opt) => (
            <Badge
              key={opt.collaborator_id}
              variant="secondary"
              className="gap-1 bg-blue-50 text-blue-700 border-blue-200 pr-1"
            >
              {toTitleCase(opt.full_name)}
              <button
                type="button"
                onClick={() => handleRemove(opt.collaborator_id)}
                className="ml-0.5 rounded-sm p-0.5 hover:bg-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                aria-label={`Remover ${toTitleCase(opt.full_name)}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
