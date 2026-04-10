import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useSystemUsers } from '@/hooks/use-metrics'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { createCollaborator, updateCollaborator } from '@/lib/api/collaborators'
import type { Collaborator, CollaboratorCreate } from '@/types/collaborator'

const schema = z.object({
  full_name: z.string().min(1, 'Nome é obrigatório').max(200),
  aliases: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  collaborator?: Collaborator | null
  onSuccess: () => void
}

export function CollaboratorFormDialog({ open, onOpenChange, collaborator, onSuccess }: Props) {
  const isEdit = !!collaborator
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const { data: users } = useSystemUsers()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (open) {
      reset({
        full_name: collaborator?.full_name ?? '',
        aliases: collaborator?.aliases?.join('; ') ?? '',
        department: collaborator?.department ?? 'E-notariado',
        position: collaborator?.position ?? '',
      })
      setSelectedUserId(collaborator?.user_id ?? '')
    }
  }, [open, collaborator, reset])

  const onSubmit = async (data: FormData) => {
    const aliases = data.aliases
      ? data.aliases.split(';').map((a) => a.trim()).filter(Boolean)
      : []
    const payload: CollaboratorCreate & { user_id?: string | null } = {
      full_name: data.full_name.trim(),
      aliases,
      department: data.department?.trim() || null,
      position: data.position?.trim() || null,
    }
    if (isEdit) {
      payload.user_id = selectedUserId || null
    }

    try {
      if (isEdit && collaborator) {
        await updateCollaborator(collaborator.id, payload)
        toast.success('Colaborador atualizado')
      } else {
        await createCollaborator(payload)
        toast.success('Colaborador criado')
      }
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (msg === 'duplicate_full_name') {
        toast.error('Já existe um colaborador com este nome')
      } else {
        toast.error('Erro ao salvar colaborador')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Colaborador' : 'Novo Colaborador'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="full_name">Nome completo *</Label>
            <Input id="full_name" {...register('full_name')} />
            {errors.full_name && (
              <p className="text-sm text-red-500 mt-1">{errors.full_name.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="aliases">Aliases (separados por ;)</Label>
            <Input id="aliases" {...register('aliases')} placeholder="Ana; Aninha" />
          </div>
          <div>
            <Label htmlFor="department">Departamento</Label>
            <Input id="department" {...register('department')} />
          </div>
          <div>
            <Label htmlFor="position">Cargo</Label>
            <Input id="position" {...register('position')} />
          </div>
          {isEdit && users && (
            <div>
              <Label>Vincular a usuário</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="w-full">
                  <span>
                    {selectedUserId
                      ? users.find((u) => u.id === selectedUserId)?.email ?? 'Selecionar...'
                      : 'Nenhum vínculo'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum vínculo</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.email} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                O usuário vinculado poderá ver suas métricas em "Meu Desempenho"
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
