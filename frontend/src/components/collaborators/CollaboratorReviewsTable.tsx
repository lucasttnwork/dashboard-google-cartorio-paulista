import { useEffect, useState } from 'react'
import { Calendar, ExternalLink, Eye, Star, User } from 'lucide-react'
import { toast } from 'sonner'

import type { CollaboratorReview } from '@/types/collaborator'
import { useReviewDetail } from '@/hooks/use-reviews'
import { ratingBorderClass } from '@/lib/chart-config'
import { toTitleCase } from '@/lib/format'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface CollaboratorReviewsTableProps {
  reviews: CollaboratorReview[]
}

const MENTION_MAX = 120

function truncate(text: string | null, max = MENTION_MAX): string {
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function displayReviewer(name: string | null | undefined): string {
  if (!name) return 'Anônimo'
  const trimmed = name.trim()
  if (!trimmed) return 'Anônimo'
  return toTitleCase(trimmed)
}

/**
 * Small rating pill — kept local so the profile table does not pull an extra
 * shared component. Color matches `ratingBorderClass` for visual consistency.
 */
function RatingBadge({ rating }: { rating: number | null }) {
  if (rating == null) {
    return (
      <Badge variant="secondary" className="gap-1 tabular-nums">
        <Star className="size-3" aria-hidden />—
      </Badge>
    )
  }

  const tone =
    rating >= 4
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : rating === 3
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-red-50 text-red-700 ring-red-200'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset tabular-nums',
        tone,
      )}
      aria-label={`${rating} estrelas`}
    >
      <Star className="size-3 fill-current" aria-hidden />
      {rating}
    </span>
  )
}

/**
 * Local detail dialog — intentionally NOT imported from `ReviewsPage.tsx`,
 * because that component is not exported and W4 is editing the file in
 * parallel. Shares the same `useReviewDetail` hook so cache is reused.
 */
function ReviewDetailDialog({
  reviewId,
  open,
  onClose,
}: {
  reviewId: string | null
  open: boolean
  onClose: () => void
}) {
  const { data: review, isLoading, isError } = useReviewDetail(reviewId)

  useEffect(() => {
    if (isError) {
      toast.error('Erro ao carregar detalhes da avaliação.')
    }
  }, [isError])

  const reviewerName =
    review?.is_anonymous || !review?.reviewer_name
      ? 'Anônimo'
      : toTitleCase(review.reviewer_name)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalhes da avaliação</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {review && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <RatingBadge rating={review.rating ?? null} />
              <span className="text-sm text-muted-foreground">
                {formatDate(review.create_time)}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <User className="size-4 text-muted-foreground" />
              <span className="font-medium">{reviewerName}</span>
            </div>

            <div>
              <h4 className="mb-1 text-sm font-medium">Comentário</h4>
              {review.comment ? (
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {review.comment}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground/60">
                  Sem comentário
                </p>
              )}
            </div>

            {review.reply_text && (
              <div>
                <h4 className="mb-1 text-sm font-medium">
                  Resposta do Cartório
                </h4>
                <div className="rounded-md bg-muted p-3">
                  <p className="whitespace-pre-line text-sm">
                    {review.reply_text}
                  </p>
                </div>
              </div>
            )}

            {review.review_url && (
              <a
                href={review.review_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" />
                Ver no Google
              </a>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function CollaboratorReviewsTable({
  reviews,
}: CollaboratorReviewsTableProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (!reviews || reviews.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-8 text-center">
        <Calendar
          className="mx-auto mb-2 size-8 text-muted-foreground/40"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">
          Nenhuma avaliação menciona este colaborador nos últimos 20 registros.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Data</TableHead>
              <TableHead className="w-[80px]">Nota</TableHead>
              <TableHead>Trecho da menção</TableHead>
              <TableHead className="w-[180px]">Revisor</TableHead>
              <TableHead className="w-[120px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((r) => {
              const borderClass = ratingBorderClass(r.rating)
              return (
                <TableRow key={r.review_id} className="group">
                  <TableCell
                    className={cn(
                      'border-l-4 text-sm text-muted-foreground tabular-nums',
                      borderClass,
                    )}
                  >
                    {formatDate(r.create_time)}
                  </TableCell>
                  <TableCell>
                    <RatingBadge rating={r.rating} />
                  </TableCell>
                  <TableCell className="max-w-[420px]">
                    {r.mention_snippet ? (
                      <p className="truncate text-sm italic text-foreground/80">
                        “{truncate(r.mention_snippet)}”
                      </p>
                    ) : (
                      <span className="text-sm italic text-muted-foreground/60">
                        sem trecho
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {displayReviewer(r.reviewer_name)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedId(r.review_id)}
                      className="h-8 gap-1 px-2 text-xs"
                    >
                      <Eye className="size-3.5" aria-hidden />
                      Ver completa
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <ReviewDetailDialog
        reviewId={selectedId}
        open={selectedId != null}
        onClose={() => setSelectedId(null)}
      />
    </>
  )
}

export default CollaboratorReviewsTable
