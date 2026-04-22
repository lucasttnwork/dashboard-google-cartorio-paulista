import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Dice5, Eye, EyeOff } from 'lucide-react'
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
import {
  createAdminUser,
  updateAdminUser,
} from '@/lib/api/admin-users'
import { fetchCollaborators } from '@/lib/api/collaborators'
import { generateStrongPassword } from '@/lib/password'
import type {
  AdminUser,
  AdminUserCreateResponse,
  Role,
} from '@/types/admin-user'
import type { Collaborator } from '@/types/collaborator'
import { useQuery } from '@tanstack/react-query'

const createSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .max(128, 'Máximo 128 caracteres'),
  role: z.enum(['admin', 'manager', 'viewer']),
  collaborator_id: z.string().optional(),
})

const editSchema = z.object({
  role: z.enum(['admin', 'manager', 'viewer']),
  collaborator_id: z.string().optional(),
})

type CreateFormData = z.infer<typeof createSchema>
type EditFormData = z.infer<typeof editSchema>

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  manager: 'Gestor',
  viewer: 'Visualizador',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AdminUser | null
  onCreated: (resp: AdminUserCreateResponse) => void
  onUpdated: () => void
}

export function UserFormDialog({
  open,
  onOpenChange,
  user,
  onCreated,
  onUpdated,
}: Props) {
  const isEdit = !!user
  const [showPassword, setShowPassword] = useState(false)
  const [selectedCollaborator, setSelectedCollaborator] = useState<string>('')

  const { data: collaborators } = useQuery<Collaborator[]>({
    queryKey: ['admin-users-collab-options'],
    queryFn: () =>
      fetchCollaborators({ include_inactive: false, page_size: 200 }).then(
        (r) => r.items,
      ),
    staleTime: 60_000,
    enabled: open,
  })

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: '', password: '', role: 'viewer' },
  })
  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  })

  useEffect(() => {
    if (!open) return
    if (isEdit && user) {
      editForm.reset({
        role: user.role,
      })
      setSelectedCollaborator(
        user.collaborator_id ? String(user.collaborator_id) : '',
      )
    } else {
      createForm.reset({ email: '', password: '', role: 'viewer' })
      setSelectedCollaborator('')
      setShowPassword(false)
    }
  }, [open, user, isEdit, createForm, editForm])

  const onCreateSubmit = async (data: CreateFormData) => {
    try {
      const collaboratorId = selectedCollaborator
        ? Number(selectedCollaborator)
        : null
      const resp = await createAdminUser({
        email: data.email.trim(),
        password: data.password,
        role: data.role,
        collaborator_id: collaboratorId,
      })
      onCreated(resp)
      onOpenChange(false)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      if (detail === 'email_exists') {
        toast.error('Já existe um usuário com este e-mail')
      } else if (detail === 'weak_password') {
        toast.error('Senha muito fraca')
      } else if (detail === 'collaborator_already_linked') {
        toast.error('Este colaborador já está vinculado a outro usuário')
      } else if (detail === 'collaborator_not_found') {
        toast.error('Colaborador não encontrado')
      } else {
        toast.error('Erro ao criar usuário')
      }
    }
  }

  const onEditSubmit = async (data: EditFormData) => {
    if (!user) return
    try {
      const newCollabId = selectedCollaborator
        ? Number(selectedCollaborator)
        : null
      const currentCollabId = user.collaborator_id
      const payload: {
        role?: Role
        collaborator_id?: number | null
        clear_collaborator?: boolean
      } = {}
      if (data.role !== user.role) payload.role = data.role
      if (newCollabId !== currentCollabId) {
        if (newCollabId === null) payload.clear_collaborator = true
        else payload.collaborator_id = newCollabId
      }
      await updateAdminUser(user.id, payload)
      toast.success('Usuário atualizado')
      onUpdated()
      onOpenChange(false)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      if (detail === 'last_admin') {
        toast.error('Não é possível rebaixar o último administrador ativo')
      } else if (detail === 'cannot_modify_self') {
        toast.error('Você não pode alterar a sua própria permissão')
      } else if (detail === 'collaborator_already_linked') {
        toast.error('Este colaborador já está vinculado a outro usuário')
      } else {
        toast.error('Erro ao atualizar usuário')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar Usuário' : 'Novo Usuário'}
          </DialogTitle>
        </DialogHeader>

        {!isEdit && (
          <form
            onSubmit={createForm.handleSubmit(onCreateSubmit)}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                autoComplete="off"
                {...createForm.register('email')}
              />
              {createForm.formState.errors.email && (
                <p className="mt-1 text-sm text-red-500">
                  {createForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="password">Senha temporária *</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    {...createForm.register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const pwd = generateStrongPassword()
                    createForm.setValue('password', pwd, {
                      shouldValidate: true,
                    })
                    setShowPassword(true)
                  }}
                  title="Gerar senha forte"
                >
                  <Dice5 className="h-4 w-4" />
                </Button>
              </div>
              {createForm.formState.errors.password && (
                <p className="mt-1 text-sm text-red-500">
                  {createForm.formState.errors.password.message}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                A senha será mostrada uma única vez após a criação — comunique
                ao usuário por canal seguro.
              </p>
            </div>
            <div>
              <Label>Permissão *</Label>
              <Select
                value={createForm.watch('role')}
                onValueChange={(v) =>
                  createForm.setValue('role', v as Role, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <span>{ROLE_LABELS[createForm.watch('role')]}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="manager">Gestor</SelectItem>
                  <SelectItem value="viewer">Visualizador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vincular a colaborador (opcional)</Label>
              <Select
                value={selectedCollaborator}
                onValueChange={(v) => setSelectedCollaborator(v ?? '')}
              >
                <SelectTrigger className="w-full">
                  <span>
                    {selectedCollaborator
                      ? collaborators?.find(
                          (c) => String(c.id) === selectedCollaborator,
                        )?.full_name ?? '—'
                      : 'Sem vínculo'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sem vínculo</SelectItem>
                  {(collaborators ?? [])
                    .filter((c) => c.user_id == null)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createForm.formState.isSubmitting}
              >
                {createForm.formState.isSubmitting ? 'Criando...' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {isEdit && user && (
          <form
            onSubmit={editForm.handleSubmit(onEditSubmit)}
            className="space-y-4"
          >
            <div>
              <Label>E-mail</Label>
              <Input value={user.email} disabled readOnly />
            </div>
            <div>
              <Label>Permissão</Label>
              <Select
                value={editForm.watch('role')}
                onValueChange={(v) =>
                  editForm.setValue('role', v as Role, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <span>
                    {ROLE_LABELS[editForm.watch('role') ?? user.role]}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="manager">Gestor</SelectItem>
                  <SelectItem value="viewer">Visualizador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vincular a colaborador</Label>
              <Select
                value={selectedCollaborator}
                onValueChange={(v) => setSelectedCollaborator(v ?? '')}
              >
                <SelectTrigger className="w-full">
                  <span>
                    {selectedCollaborator
                      ? collaborators?.find(
                          (c) => String(c.id) === selectedCollaborator,
                        )?.full_name ?? user.collaborator_name ?? '—'
                      : 'Sem vínculo'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sem vínculo</SelectItem>
                  {(collaborators ?? [])
                    .filter(
                      (c) =>
                        c.user_id == null ||
                        c.user_id === user.id ||
                        c.id === user.collaborator_id,
                    )
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={editForm.formState.isSubmitting}>
                {editForm.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
