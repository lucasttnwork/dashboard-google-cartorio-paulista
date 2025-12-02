"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import { ChevronDown, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/Input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useUI } from "@/store/use-ui"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  tableId: string
  searchPlaceholder?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  tableId,
  searchPlaceholder = "Filtrar...",
}: DataTableProps<TData, TValue>) {
  const { columnVisibility, setColumnVisibility } = useUI()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibilityState, setColumnVisibilityState] = React.useState<VisibilityState>(
    columnVisibility[tableId] || {}
  )
  const [rowSelection, setRowSelection] = React.useState({})
  const [globalFilter, setGlobalFilter] = React.useState("")

  // Global filter function that searches across multiple columns
  const globalFilterFn = (row: any, columnId: string, filterValue: string) => {
    if (!filterValue) return true

    const hay = `${row.getValue('reviewer_name') ?? ''} ${row.getValue('comment') ?? ''} ${row.getValue('collection_source') ?? ''}`.toString().toLowerCase()
    const needle = filterValue.toLowerCase()

    return hay.includes(needle)
  }

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibilityState,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    state: {
      sorting,
      columnFilters,
      columnVisibility: columnVisibilityState,
      rowSelection,
      globalFilter,
    },
  })

  // Salvar visibilidade das colunas no Zustand
  React.useEffect(() => {
    setColumnVisibility(tableId, columnVisibilityState)
  }, [columnVisibilityState, tableId, setColumnVisibility])

  // Persistir preferências da tabela no localStorage
  React.useEffect(() => {
    const saved = localStorage.getItem(`table-${tableId}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.columnVisibility) {
          setColumnVisibilityState(parsed.columnVisibility)
        }
      } catch (error) {
        console.warn('Erro ao restaurar preferências da tabela:', error)
      }
    }
  }, [tableId])

  React.useEffect(() => {
    const preferences = {
      columnVisibility: columnVisibilityState,
      sorting: sorting,
      globalFilter: globalFilter,
    }
    localStorage.setItem(`table-${tableId}`, JSON.stringify(preferences))
  }, [columnVisibilityState, sorting, globalFilter, tableId])

  return (
    <div className="w-full">
      <div className="flex items-center py-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="pl-9 transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="ml-auto bg-transparent border border-[hsl(var(--border))] text-white/90 hover:bg-accent/80 hover:text-foreground transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] rounded-lg"
            >
              Colunas <ChevronDown className="ml-2 h-4 w-4 transition-transform duration-200" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))]">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="transition-colors duration-200 hover:bg-accent/50 cursor-pointer"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  Nenhum resultado encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} de{" "}
          {table.getFilteredRowModel().rows.length} linha(s) selecionada(s).
        </div>
        <div className="space-x-2">
          <Button
            variant="ghost"
            size="sm"
            className="bg-transparent border border-[hsl(var(--border))] text-white/90 hover:bg-white/5 rounded-lg"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Anterior
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="bg-transparent border border-[hsl(var(--border))] text-white/90 hover:bg-white/5 rounded-lg"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Próximo
          </Button>
        </div>
      </div>
    </div>
  )
}
