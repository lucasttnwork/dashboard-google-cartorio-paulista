import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Star,
  Search,
  X,
  MessageSquare,
  User,
  Calendar,
  ExternalLink,
  Loader2,
} from 'lucide-react'

import { useReviews, useReviewDetail } from '@/hooks/use-reviews'
import type { ReviewOut } from '@/types/review'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

/* ---------- helpers ---------- */

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`size-4 ${i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
        />
      ))}
    </div>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR')
}

function formatTotal(n: number): string {
  return n.toLocaleString('pt-BR')
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  // D2: Hide badge entirely when no classification exists
  if (!sentiment || sentiment === 'unknown') return null

  const map: Record<string, { label: string; className: string }> = {
    pos: {
      label: 'Positivo',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    },
    neu: {
      label: 'Neutro',
      className: 'bg-gray-100 text-gray-700 border-gray-200',
    },
    neg: {
      label: 'Negativo',
      className: 'bg-red-100 text-red-700 border-red-200',
    },
  }

  const cfg = map[sentiment] ?? { label: sentiment, className: '' }
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  )
}

function truncate(text: string | null, max = 200): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '...' : text
}

/* ---------- sub-components ---------- */

function ReviewCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="mt-2 h-4 w-36" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/4" />
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-5 w-16" />
        </div>
      </CardContent>
    </Card>
  )
}

function ReviewCard({
  review,
  onClick,
}: {
  review: ReviewOut
  onClick: () => void
}) {
  const reviewerName =
    review.is_anonymous || !review.reviewer_name
      ? 'Anônimo'
      : review.reviewer_name

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/20"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Stars rating={review.rating ?? 0} />
          <span className="text-sm text-muted-foreground">
            <Calendar className="mr-1 inline size-3.5" />
            {formatDate(review.create_time)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <User className="size-3.5 text-muted-foreground" />
          {reviewerName}
        </div>
      </CardHeader>
      <CardContent>
        {review.comment ? (
          <p className="text-sm text-muted-foreground">
            {truncate(review.comment)}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground/60">
            Sem comentário
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SentimentBadge sentiment={review.sentiment} />
          {review.reply_text && (
            <Badge variant="secondary" className="gap-1">
              <MessageSquare className="size-3" />
              Respondida
            </Badge>
          )}
          {review.collaborator_names.length > 0 &&
            review.collaborator_names.map((name) => (
              <Badge key={name} variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                {name}
              </Badge>
            ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- detail dialog ---------- */

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
      : review.reviewer_name

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
            {/* Rating + date */}
            <div className="flex items-center justify-between">
              <Stars rating={review.rating ?? 0} />
              <span className="text-sm text-muted-foreground">
                {formatDate(review.create_time)}
              </span>
            </div>

            {/* Reviewer info */}
            <div className="flex items-center gap-2 text-sm">
              <User className="size-4 text-muted-foreground" />
              <span className="font-medium">{reviewerName}</span>
              {review.is_local_guide && (
                <Badge variant="secondary" className="text-xs">
                  Local Guide
                </Badge>
              )}
            </div>

            {/* Full comment */}
            <div>
              <h4 className="mb-1 text-sm font-medium">Comentário</h4>
              {review.comment ? (
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {review.comment}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground/60">
                  Sem comentário
                </p>
              )}
            </div>

            {/* Sentiment */}
            <div>
              <h4 className="mb-1 text-sm font-medium">Sentimento</h4>
              <SentimentBadge sentiment={review.sentiment} />
            </div>

            {/* Reply */}
            <div>
              <h4 className="mb-1 text-sm font-medium">
                Resposta do Cartório
              </h4>
              {review.reply_text ? (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm whitespace-pre-line">
                    {review.reply_text}
                  </p>
                  {review.reply_time && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Respondido em {formatDate(review.reply_time)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm italic text-muted-foreground/60">
                  Sem resposta
                </p>
              )}
            </div>

            {/* Collaborator mentions */}
            {review.mentions && review.mentions.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium">
                  Colaboradores mencionados
                </h4>
                <div className="flex flex-wrap gap-2">
                  {review.mentions.map((m) => (
                    <Badge
                      key={m.collaborator_id}
                      variant="secondary"
                      className="gap-1"
                    >
                      {m.collaborator_name}
                      {m.match_score != null && (
                        <span className="text-xs text-muted-foreground">
                          ({(m.match_score * 100).toFixed(0)}%)
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Google link */}
            {review.review_url && (
              <div>
                <a
                  href={review.review_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  Ver no Google
                </a>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ---------- main page ---------- */

const RATING_OPTIONS = [
  { value: 'all', label: 'Todas as notas' },
  { value: '5', label: '5 estrelas' },
  { value: '4', label: '4 estrelas' },
  { value: '3', label: '3 estrelas' },
  { value: '2', label: '2 estrelas' },
  { value: '1', label: '1 estrela' },
]

export default function ReviewsPage() {
  /* filter state */
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [rating, setRating] = useState<number | undefined>(undefined)
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null)

  /* debounce search 300ms */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const hasFilters = debouncedSearch !== '' || rating !== undefined

  const clearFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setRating(undefined)
  }, [])

  /* data */
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useReviews({
    search: debouncedSearch || undefined,
    rating,
    sort_by: 'create_time',
    sort_order: 'desc',
  })

  useEffect(() => {
    if (isError) {
      toast.error('Erro ao carregar avaliações.')
    }
  }, [isError])

  const allReviews = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Avaliações</h1>
        {!isLoading && (
          <p className="text-sm text-muted-foreground">
            {formatTotal(total)} avaliações encontradas
          </p>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por comentário ou avaliador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={rating !== undefined ? String(rating) : 'all'}
          onValueChange={(v) => setRating(v === 'all' ? undefined : Number(v))}
        >
          <SelectTrigger className="w-full sm:w-44">
            <span>
              {RATING_OPTIONS.find((o) => o.value === (rating !== undefined ? String(rating) : 'all'))?.label ?? 'Todas as notas'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {RATING_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 size-4" />
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Reviews list */}
      <div className="space-y-3">
        {isLoading && (
          <>
            <ReviewCardSkeleton />
            <ReviewCardSkeleton />
            <ReviewCardSkeleton />
          </>
        )}

        {!isLoading && allReviews.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center">
              <MessageSquare className="mx-auto mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Nenhuma avaliação encontrada para os filtros selecionados.
              </p>
            </CardContent>
          </Card>
        )}

        {allReviews.map((review) => (
          <ReviewCard
            key={review.review_id}
            review={review}
            onClick={() => setSelectedReviewId(review.review_id)}
          />
        ))}
      </div>

      {/* Load more */}
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Carregando...
              </>
            ) : (
              'Carregar mais avaliações'
            )}
          </Button>
        </div>
      )}

      {/* Detail dialog */}
      <ReviewDetailDialog
        reviewId={selectedReviewId}
        open={selectedReviewId !== null}
        onClose={() => setSelectedReviewId(null)}
      />
    </div>
  )
}
