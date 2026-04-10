import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { mergeCollaborators } from '@/lib/api/collaborators'
import type { Collaborator } from '@/types/collaborator'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  collaborators: Collaborator[]
  onSuccess: () => void
}

export function MergeDialog({ open, onOpenChange, collaborators, onSuccess }: Props) {
  const [sourceId, setSourceId] = useState<string>('')
  const [targetId, setTargetId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const source = collaborators.find((c) => c.id === Number(sourceId))
  const target = collaborators.find((c) => c.id === Number(targetId))

  const canMerge = sourceId && targetId && sourceId !== targetId && !submitting

  const handleConfirm = async () => {
    if (!canMerge) return
    setSubmitting(true)
    try {
      const result = await mergeCollaborators({
        source_id: Number(sourceId),
        target_id: Number(targetId),
      })
      toast.success(
        `Merge concluído: ${result.mentions_transferred} menções transferidas`
      )
      onOpenChange(false)
      setSourceId('')
      setTargetId('')
      onSuccess()
    } catch {
      toast.error('Erro ao realizar merge')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge de Colaboradores</DialogTitle>
          <DialogDescription>
            O colaborador "origem" será absorvido pelo "destino". Essa ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Origem (será desativado)</label>
            <Select value={sourceId} onValueChange={(v) => setSourceId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar colaborador..." />
              </SelectTrigger>
              <SelectContent>
                {collaborators
                  .filter((c) => c.id !== Number(targetId))
                  .map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.full_name} ({c.mention_count} menções)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Destino (receberá as menções)</label>
            <Select value={targetId} onValueChange={(v) => setTargetId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar colaborador..." />
              </SelectTrigger>
              <SelectContent>
                {collaborators
                  .filter((c) => c.id !== Number(sourceId))
                  .map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.full_name} ({c.mention_count} menções)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {source && target && (
            <>
              <Separator />
              <div className="rounded-md border p-3 text-sm space-y-2">
                <p className="font-medium">Preview do merge:</p>
                <p>
                  <span className="text-muted-foreground">Origem:</span>{' '}
                  {source.full_name}
                  <Badge variant="secondary" className="ml-2">{source.mention_count} menções</Badge>
                </p>
                <p>
                  <span className="text-muted-foreground">Destino:</span>{' '}
                  {target.full_name}
                  <Badge variant="secondary" className="ml-2">{target.mention_count} menções</Badge>
                </p>
                <p>
                  <span className="text-muted-foreground">Aliases a adicionar:</span>{' '}
                  {[source.full_name, ...(source.aliases || [])].join(', ')}
                </p>
                <p className="text-amber-600 font-medium">
                  Até {source.mention_count} menções serão transferidas para {target.full_name}.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!canMerge}
            onClick={handleConfirm}
          >
            {submitting ? 'Processando...' : 'Confirmar Merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
