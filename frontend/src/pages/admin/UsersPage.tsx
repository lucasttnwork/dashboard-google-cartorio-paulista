import { useMemo, useState } from 'react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  fetchAdminUsers,
  updateAdminUser,
  deleteAdminUser,
} from '@/lib/api/admin-users'
import { UserFormDialog } from '@/components/users/UserFormDialog'
import { TempPasswordModal } from '@/components/users/TempPasswordModal'
import { useAuthStore } from '@/lib/auth/store'
import type { AdminUser, AdminUserCreateResponse, Role } from '@/types/admin-user'

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  manager: 'Gestor',
  viewer: 'Visualizador',
}

function RowActions({
  user,
  isSelf,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  user: AdminUser
  isSelf: boolean
  onEdit: (u: AdminUser) => void
  onToggleActive: (u: AdminUser) => void
  onDelete: (u: AdminUser) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Ações</span>
          </button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onClick={() => onEdit(user)}>
          <Pencil className="mr-2 h-4 w-4" /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isSelf}
          onClick={() => onToggleActive(user)}
        >
          {user.is_active ? (
            <>
              <PowerOff className="mr-2 h-4 w-4" /> Desativar
            </>
          ) : (
            <>
              <Power className="mr-2 h-4 w-4" /> Reativar
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isSelf}
          variant="destructive"
          onClick={() => onDelete(user)}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function UsersPage() {
  const qc = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null)
  const [tempPwd, setTempPwd] = useState<AdminUserCreateResponse | null>(null)
  const [sorting, setSorting] = useState<SortingState>([])

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: fetchAdminUsers,
    staleTime: 30_000,
  })

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['admin-users'] })

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateAdminUser(id, { is_active: active }),
    onSuccess: (_, vars) => {
      toast.success(vars.active ? 'Usuário reativado' : 'Usuário desativado')
      invalidate()
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      if (detail === 'last_admin') {
        toast.error('Não é possível desativar o último administrador ativo')
      } else if (detail === 'cannot_disable_self') {
        toast.error('Você não pode se auto-desativar')
      } else {
        toast.error('Erro ao alterar status')
      }
    },
  })

  const removeUser = useMutation({
    mutationFn: (id: string) => deleteAdminUser(id),
    onSuccess: () => {
      toast.success('Usuário excluído')
      invalidate()
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      if (detail === 'last_admin') {
        toast.error('Não é possível excluir o último administrador ativo')
      } else if (detail === 'cannot_delete_self') {
        toast.error('Você não pode excluir a si mesmo')
      } else {
        toast.error('Erro ao excluir usuário')
      }
    },
  })

  const handleDelete = (u: AdminUser) => {
    const msg = u.collaborator_id
      ? `Excluir ${u.email}? O colaborador "${u.collaborator_name}" será desvinculado e marcado como inativo. Esta ação é irreversível.`
      : `Excluir ${u.email}? Esta ação é irreversível.`
    if (window.confirm(msg)) removeUser.mutate(u.id)
  }

  const columns: ColumnDef<AdminUser>[] = useMemo(
    () => [
      {
        accessorKey: 'email',
        header: 'E-mail',
        cell: ({ row }) => (
          <span className="font-medium">{row.original.email}</span>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Permissão',
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.role === 'admin'
                ? 'default'
                : row.original.role === 'manager'
                  ? 'secondary'
                  : 'outline'
            }
          >
            {ROLE_LABEL[row.original.role]}
          </Badge>
        ),
      },
      {
        accessorKey: 'collaborator_name',
        header: 'Colaborador',
        cell: ({ row }) =>
          row.original.collaborator_name ?? (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge variant="default">Ativo</Badge>
          ) : (
            <Badge variant="outline">Inativo</Badge>
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <RowActions
            user={row.original}
            isSelf={row.original.id === currentUserId}
            onEdit={(u) => {
              setEditTarget(u)
              setFormOpen(true)
            }}
            onToggleActive={(u) =>
              toggleActive.mutate({ id: u.id, active: !u.is_active })
            }
            onDelete={handleDelete}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUserId],
  )

  const table = useReactTable({
    data: users,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuários</h1>
        <Button
          size="sm"
          onClick={() => {
            setEditTarget(null)
            setFormOpen(true)
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Novo usuário
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center">
                  Nenhum usuário encontrado
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        {users.length} usuário{users.length !== 1 ? 's' : ''}
      </p>

      {formOpen && (
        <UserFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          user={editTarget}
          onCreated={(resp) => {
            invalidate()
            setTempPwd(resp)
          }}
          onUpdated={invalidate}
        />
      )}

      {tempPwd && (
        <TempPasswordModal
          open={!!tempPwd}
          onClose={() => setTempPwd(null)}
          email={tempPwd.email}
          tempPassword={tempPwd.temp_password}
        />
      )}
    </div>
  )
}
