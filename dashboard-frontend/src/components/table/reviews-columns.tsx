import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Star, User } from "lucide-react"

export type Review = {
  review_id: string
  rating: number
  comment?: string
  reviewer_name?: string
  create_time: string
  update_time?: string
  collection_source?: string
}

export const reviewsColumns: ColumnDef<Review>[] = [
  {
    accessorKey: "reviewer_name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-auto p-0 font-semibold hover:bg-transparent"
        >
          Avaliador
          {column.getIsSorted() === "asc" && <span className="ml-1">↑</span>}
          {column.getIsSorted() === "desc" && <span className="ml-1">↓</span>}
        </Button>
      )
    },
    cell: ({ row }) => {
      const name = row.getValue("reviewer_name") as string
      return (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">
            {name || "Anônimo"}
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: "rating",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-auto p-0 font-semibold hover:bg-transparent"
        >
          Avaliação
          {column.getIsSorted() === "asc" && <span className="ml-1">↑</span>}
          {column.getIsSorted() === "desc" && <span className="ml-1">↓</span>}
        </Button>
      )
    },
    cell: ({ row }) => {
      const rating = row.getValue("rating") as number
      return (
        <div className="flex items-center gap-1">
          <div className="flex">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`h-4 w-4 ${
                  i < rating
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground"
                }`}
              />
            ))}
          </div>
          <span className="text-sm font-medium ml-2">{rating}/5</span>
        </div>
      )
    },
  },
  {
    accessorKey: "comment",
    header: "Comentário",
    cell: ({ row }) => {
      const comment = row.getValue("comment") as string
      if (!comment) return <span className="text-muted-foreground">Sem comentário</span>

      return (
        <div className="max-w-[300px] truncate" title={comment}>
          {comment}
        </div>
      )
    },
  },
  {
    accessorKey: "create_time",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-auto p-0 font-semibold hover:bg-transparent"
        >
          Data
          {column.getIsSorted() === "asc" && <span className="ml-1">↑</span>}
          {column.getIsSorted() === "desc" && <span className="ml-1">↓</span>}
        </Button>
      )
    },
    cell: ({ row }) => {
      const date = row.getValue("create_time") as string
      return (
        <div className="text-sm">
          {format(new Date(date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
        </div>
      )
    },
  },
  {
    accessorKey: "collection_source",
    header: "Fonte",
    cell: ({ row }) => {
      const source = row.getValue("collection_source") as string
      return (
        <Badge variant="outline" className="capitalize">
          {source || "Manual"}
        </Badge>
      )
    },
  },
]
