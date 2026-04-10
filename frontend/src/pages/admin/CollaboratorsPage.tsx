import { useMemo, useRef, useState } from 'react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowUpDown, Download, Merge, Pencil, Plus, Power, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CollaboratorFormDialog } from '@/components/collaborators/CollaboratorFormDialog'
import { MergeDialog } from '@/components/collaborators/MergeDialog'
import {
  fetchCollaborators,
  deleteCollaborator,
  reactivateCollaborator,
  exportCollaboratorsCSV,
  importCollaboratorsCSV,
} from '@/lib/api/collaborators'
import type { Collaborator } from '@/types/collaborator'

export default function CollaboratorsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Collaborator | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Debounce search input
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const handleSearchChange = (value: string) => {
    setSearch(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  const { data: queryData, isLoading: loading } = useQuery({
    queryKey: ['collaborators', debouncedSearch, includeInactive],
    queryFn: () =>
      fetchCollaborators({
        search: debouncedSearch || undefined,
        include_inactive: includeInactive,
        page_size: 200,
      }),
    staleTime: 30_000,
  })

  const data = queryData?.items ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['collaborators'] })

  const handleDeactivate = async (id: number) => {
    try {
      await deleteCollaborator(id)
      toast.success('Colaborador desativado')
      invalidate()
    } catch {
      toast.error('Erro ao desativar')
    }
  }

  const handleReactivate = async (id: number) => {
    try {
      await reactivateCollaborator(id)
      toast.success('Colaborador reativado')
      invalidate()
    } catch {
      toast.error('Erro ao reativar')
    }
  }

  const handleExport = async () => {
    try {
      await exportCollaboratorsCSV(includeInactive)
      toast.success('CSV exportado')
    } catch {
      toast.error('Erro ao exportar')
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await importCollaboratorsCSV(file)
      toast.success(`Importado: ${result.created} criados, ${result.updated} atualizados`)
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} erros na importação`)
      }
      invalidate()
    } catch {
      toast.error('Erro ao importar CSV')
    }
    e.target.value = ''
  }

  const columns: ColumnDef<Collaborator>[] = useMemo(
    () => [
      {
        accessorKey: 'full_name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Nome <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div>
            <span className="font-medium">{row.original.full_name}</span>
            {row.original.aliases.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {row.original.aliases.join(', ')}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'department',
        header: 'Departamento',
        cell: ({ getValue }) => getValue() || '—',
      },
      {
        accessorKey: 'position',
        header: 'Cargo',
        cell: ({ getValue }) => getValue() || '—',
      },
      {
        accessorKey: 'mention_count',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Menções <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ getValue }) => (
          <Badge variant="secondary">{getValue() as number}</Badge>
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ getValue }) =>
          getValue() ? (
            <Badge variant="default">Ativo</Badge>
          ) : (
            <Badge variant="outline">Inativo</Badge>
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const c = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 px-3"
              >
                Ações
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setEditTarget(c)
                    setFormOpen(true)
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </DropdownMenuItem>
                {c.is_active ? (
                  <DropdownMenuItem onClick={() => handleDeactivate(c.id)}>
                    <Power className="mr-2 h-4 w-4" /> Desativar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => handleReactivate(c.id)}>
                    <Power className="mr-2 h-4 w-4" /> Reativar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Colaboradores</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1 h-4 w-4" /> Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> Importar CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImport}
          />
          <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
            <Merge className="mr-1 h-4 w-4" /> Merge
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditTarget(null)
              setFormOpen(true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Novo
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Input
          placeholder="Buscar por nome ou alias..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="include-inactive"
            checked={includeInactive}
            onCheckedChange={setIncludeInactive}
          />
          <Label htmlFor="include-inactive" className="text-sm">
            Incluir inativos
          </Label>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8">
                  Nenhum colaborador encontrado
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

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data.length} colaborador{data.length !== 1 ? 'es' : ''}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Próxima
          </Button>
        </div>
      </div>

      <CollaboratorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        collaborator={editTarget}
        onSuccess={loadData}
      />

      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        collaborators={data}
        onSuccess={loadData}
      />
    </div>
  )
}
