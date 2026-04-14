import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  LayoutList,
  LayoutGrid,
} from 'lucide-react'

import { useReviews, useReviewDetail } from '@/hooks/use-reviews'
import { useCollaboratorMentions } from '@/hooks/use-metrics'
import type { ReviewOut } from '@/types/review'
import { ratingBorderClass } from '@/lib/chart-config'
import { toTitleCase, MONTHS_PT } from '@/lib/format'

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
import { CollaboratorMultiSelect } from '@/components/reviews/CollaboratorMultiSelect'

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

/** dd MMM yyyy (PT-BR abreviado) — usado no modo compacto. */
function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const day = String(d.getDate()).padStart(2, '0')
  const month = MONTHS_PT[d.getMonth()] ?? ''
  return `${day} ${month} ${d.getFullYear()}`
}

function formatTotal(n: number): string {
  return n.toLocaleString('pt-BR')
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
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

/** Rating badge com cor sólida — modo compacto. */
function RatingBadge({ rating }: { rating: number | null }) {
  if (rating == null) {
    return (
      <Badge variant="outline" className="gap-0.5 bg-gray-50 text-gray-700">
        —
      </Badge>
    )
  }
  const cls =
    rating >= 4
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : rating === 3
        ? 'bg-amber-100 text-amber-800 border-amber-200'
        : 'bg-red-100 text-red-800 border-red-200'
  return (
    <Badge variant="outline" className={`gap-0.5 ${cls}`}>
      <Star className="size-3 fill-current" />
      {rating}
    </Badge>
  )
}

function truncate(text: string | null, max = 200): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '…' : text
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

  const hasComment = !!review.comment
  const borderClass = ratingBorderClass(review.rating)

  return (
    <Card
      className={`cursor-pointer border-l-4 transition-all hover:shadow-md hover:border-primary/20 ${borderClass} ${!hasComment ? 'py-1' : ''}`}
      onClick={onClick}
    >
      <CardHeader className={hasComment ? 'pb-3' : 'pb-1 pt-3'}>
        <div className="flex items-center justify-between">
          <Stars rating={review.rating ?? 0} />
          <span className="text-sm text-muted-foreground">
            <Calendar className="mr-1 inline size-3.5" />
            {formatDate(review.create_time)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <User className="size-3.5 text-muted-foreground" />
          {toTitleCase(reviewerName)}
        </div>
      </CardHeader>
      <CardContent className={!hasComment ? 'pb-3' : undefined}>
        {hasComment ? (
          <p className="text-sm text-muted-foreground">
            {truncate(review.comment)}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground/50">
            Sem comentário
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
                {toTitleCase(name)}
              </Badge>
            ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- compact row ---------- */

function ReviewCompactRow({
  review,
  onClick,
}: {
  review: ReviewOut
  onClick: () => void
}) {
  const reviewerName =
    review.is_anonymous || !review.reviewer_name
      ? 'Anônimo'
      : toTitleCase(review.reviewer_name)

  const borderClass = ratingBorderClass(review.rating)
  const snippet = review.comment ? truncate(review.comment, 80) : '—'
  const collabs = review.collaborator_names
  const visibleCollabs = collabs.slice(0, 3)
  const extraCollabs = collabs.length - visibleCollabs.length

  return (
    <div
      className={`group grid grid-cols-12 items-center gap-3 border-l-4 border-y border-r border-transparent border-y-border/60 bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/40 ${borderClass}`}
    >
      <div className="col-span-2 text-xs text-muted-foreground whitespace-nowrap">
        {formatDateShort(review.create_time)}
      </div>
      <div className="col-span-1">
        <RatingBadge rating={review.rating} />
      </div>
      <div className="col-span-2 truncate font-medium">{reviewerName}</div>
      <div className="col-span-4 truncate text-muted-foreground">{snippet}</div>
      <div className="col-span-2 flex flex-wrap gap-1">
        {visibleCollabs.map((name) => (
          <Badge
            key={name}
            variant="secondary"
            className="h-5 px-1.5 text-[10px] bg-blue-50 text-blue-700 border-blue-200"
          >
            {toTitleCase(name)}
          </Badge>
        ))}
        {extraCollabs > 0 && (
          <Badge
            variant="secondary"
            className="h-5 px-1.5 text-[10px] bg-muted text-muted-foreground"
          >
            +{extraCollabs}
          </Badge>
        )}
      </div>
      <div className="col-span-1 flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onClick}
        >
          Ver
        </Button>
      </div>
    </div>
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
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
        closeLabel="Fechar detalhes da avaliação"
      >
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
              <Stars rating={review.rating ?? 0} />
              <span className="text-sm text-muted-foreground">
                {formatDate(review.create_time)}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <User className="size-4 text-muted-foreground" />
              <span className="font-medium">{toTitleCase(reviewerName)}</span>
              {review.is_local_guide && (
                <Badge variant="secondary" className="text-xs">
                  Local Guide
                </Badge>
              )}
            </div>

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

            <div>
              <h4 className="mb-1 text-sm font-medium">Sentimento</h4>
              <SentimentBadge sentiment={review.sentiment} />
            </div>

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
                      {toTitleCase(m.collaborator_name)}
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

/* ---------- constants ---------- */

const RATING_OPTIONS = [
  { value: 'all', label: 'Todas as notas' },
  { value: '5', label: '5 estrelas' },
  { value: '4', label: '4 estrelas' },
  { value: '3', label: '3 estrelas' },
  { value: '2', label: '2 estrelas' },
  { value: '1', label: '1 estrela' },
]

const REPLY_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'true', label: 'Com resposta' },
  { value: 'false', label: 'Sem resposta' },
]

const SORT_OPTIONS = [
  { value: 'create_time:desc', label: 'Mais recentes' },
  { value: 'create_time:asc', label: 'Mais antigas' },
  { value: 'rating:desc', label: 'Maior nota' },
  { value: 'rating:asc', label: 'Menor nota' },
]

const SENTIMENT_OPTIONS = [
  { value: 'all', label: 'Todos os sentimentos' },
  { value: 'pos', label: 'Positivo' },
  { value: 'neu', label: 'Neutro' },
  { value: 'neg', label: 'Negativo' },
  { value: 'unknown', label: 'Não classificado' },
]

const VALID_SORT_BY = new Set(['create_time', 'rating'])
const VALID_SORT_ORDER = new Set(['asc', 'desc'])
const VALID_SENTIMENTS = new Set(['pos', 'neu', 'neg', 'unknown'])

// F6 (phase 3.8): accept long-form aliases from external links and map
// them to the canonical short values the backend expects. Only used at
// the URL-parse boundary — the canonical value is what flows into the
// API call.
const SENTIMENT_ALIASES: Record<string, string> = {
  positive: 'pos',
  neutral: 'neu',
  negative: 'neg',
  unknown: 'unknown',
}

export function normalizeSentimentParam(
  raw: string | null,
): string | undefined {
  if (!raw) return undefined
  const canonical = SENTIMENT_ALIASES[raw] ?? raw
  return VALID_SENTIMENTS.has(canonical) ? canonical : undefined
}

// F3 (phase 3.8): cap applied at the URL-parse boundary so excess IDs
// never reach the API or the chip list — a single source of truth.
export const MAX_COLLABORATOR_FILTERS = 3

const VIEW_MODE_KEY = 'reviews-view-mode'
type ViewMode = 'compact' | 'expanded'

function readInitialViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'expanded'
  const stored = window.localStorage.getItem(VIEW_MODE_KEY)
  return stored === 'compact' ? 'compact' : 'expanded'
}

/* ---------- main page ---------- */

export default function ReviewsPage() {
  /* URL-derived state (AC-3.7.15) */
  const [searchParams, setSearchParams] = useSearchParams()

  // Derive everything inline from URL — no mirroring via useEffect.
  const searchRaw = searchParams.get('search') ?? ''
  const ratingRaw = searchParams.get('rating')
  const rating =
    ratingRaw && /^[1-5]$/.test(ratingRaw) ? Number(ratingRaw) : undefined

  const hasReplyRaw = searchParams.get('has_reply')
  const hasReply =
    hasReplyRaw === 'true'
      ? true
      : hasReplyRaw === 'false'
        ? false
        : undefined

  const sortByRaw = searchParams.get('sort_by') ?? 'create_time'
  const sortOrderRaw = searchParams.get('sort_order') ?? 'desc'
  const sortBy = VALID_SORT_BY.has(sortByRaw) ? sortByRaw : 'create_time'
  const sortOrder = (
    VALID_SORT_ORDER.has(sortOrderRaw) ? sortOrderRaw : 'desc'
  ) as 'asc' | 'desc'
  const sortKey = `${sortBy}:${sortOrder}`

  const sentiment = normalizeSentimentParam(searchParams.get('sentiment'))

  const collaboratorIds = useMemo<number[]>(() => {
    const raw = searchParams.getAll('collaborator_id')
    const parsed = raw
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0)
    // Dedup preserving order.
    const seen = new Set<number>()
    const out: number[] = []
    for (const id of parsed) {
      if (!seen.has(id)) {
        seen.add(id)
        out.push(id)
      }
    }
    // F3: cap here so the limit applies equally to URL load, chip render,
    // and the outgoing API call — the one place the list is materialized.
    return out.slice(0, MAX_COLLABORATOR_FILTERS)
    // searchParams identity changes per setSearchParams call — that's our signal.
  }, [searchParams])

  /* Search input is a mirrored, debounced local state — URL is updated after debounce. */
  const [searchInput, setSearchInput] = useState(searchRaw)
  // Keep input in sync when URL changes externally (back/forward nav).
  useEffect(() => {
    setSearchInput(searchRaw)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRaw])

  useEffect(() => {
    if (searchInput === searchRaw) return
    const timer = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (searchInput) next.set('search', searchInput)
          else next.delete('search')
          return next
        },
        { replace: true },
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, searchRaw, setSearchParams])

  const debouncedSearch = searchRaw

  /* Local UI state (not URL-backed) */
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(readInitialViewMode)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  /* Collaborator options for the multi-select (AC-3.7.13) */
  const mentionsQuery = useCollaboratorMentions({ months: 12 })
  const collaboratorOptions = useMemo(() => {
    const list = mentionsQuery.data?.collaborators ?? []
    return list
      .map((c) => ({
        collaborator_id: c.collaborator_id,
        full_name: c.full_name,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
  }, [mentionsQuery.data])

  /* URL update helpers */
  const updateParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value == null || value === '') next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const setCollaboratorIds = useCallback(
    (ids: number[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('collaborator_id')
          for (const id of ids) next.append('collaborator_id', String(id))
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const setSortKey = useCallback(
    (value: string) => {
      const [by, order] = value.split(':')
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (by && by !== 'create_time') next.set('sort_by', by)
          else next.delete('sort_by')
          if (order && order !== 'desc') next.set('sort_order', order)
          else next.delete('sort_order')
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const hasFilters =
    debouncedSearch !== '' ||
    rating !== undefined ||
    hasReply !== undefined ||
    sentiment !== undefined ||
    collaboratorIds.length > 0 ||
    sortKey !== 'create_time:desc'

  const clearFilters = useCallback(() => {
    setSearchInput('')
    setSearchParams(new URLSearchParams(), { replace: false })
  }, [setSearchParams])

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
    has_reply: hasReply,
    sort_by: sortBy,
    sort_order: sortOrder,
    collaborator_id:
      collaboratorIds.length > 0 ? collaboratorIds : undefined,
    sentiment,
  })

  useEffect(() => {
    if (isError) {
      toast.error('Erro ao carregar avaliações.')
    }
  }, [isError])

  const allReviews = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0

  const ratingSelectValue = rating !== undefined ? String(rating) : 'all'
  const replySelectValue =
    hasReply !== undefined ? String(hasReply) : 'all'
  const sentimentSelectValue = sentiment ?? 'all'

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Avaliações</h1>
        {/* View mode toggle (AC-3.7.17) */}
        <div
          className="inline-flex overflow-hidden rounded-lg border border-input bg-background"
          role="group"
          aria-label="Modo de visualização"
        >
          <button
            type="button"
            onClick={() => setViewMode('expanded')}
            aria-pressed={viewMode === 'expanded'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'expanded'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <LayoutGrid className="size-3.5" />
            Expandido
          </button>
          <button
            type="button"
            onClick={() => setViewMode('compact')}
            aria-pressed={viewMode === 'compact'}
            className={`inline-flex items-center gap-1.5 border-l border-input px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'compact'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <LayoutList className="size-3.5" />
            Compacto
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por comentário ou avaliador..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={ratingSelectValue}
          onValueChange={(v) =>
            updateParam('rating', v === 'all' ? null : v)
          }
        >
          <SelectTrigger className="w-full sm:w-40">
            <span>
              {RATING_OPTIONS.find((o) => o.value === ratingSelectValue)
                ?.label ?? 'Todas as notas'}
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

        <Select
          value={replySelectValue}
          onValueChange={(v) =>
            updateParam('has_reply', v === 'all' ? null : v)
          }
        >
          <SelectTrigger className="w-full sm:w-40">
            <span>
              {REPLY_OPTIONS.find((o) => o.value === replySelectValue)
                ?.label ?? 'Todas'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {REPLY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sentiment filter (AC-3.7.14) */}
        <Select
          value={sentimentSelectValue}
          onValueChange={(v) =>
            updateParam('sentiment', v === 'all' ? null : v)
          }
        >
          <SelectTrigger className="w-full sm:w-48">
            <span>
              {SENTIMENT_OPTIONS.find(
                (o) => o.value === sentimentSelectValue,
              )?.label ?? 'Todos os sentimentos'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {SENTIMENT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Collaborator multi-select (AC-3.7.13) */}
        <CollaboratorMultiSelect
          options={collaboratorOptions}
          selected={collaboratorIds}
          onChange={setCollaboratorIds}
          maxSelection={3}
          isLoading={mentionsQuery.isLoading}
        />

        <Select value={sortKey} onValueChange={(v) => v && setSortKey(v)}>
          <SelectTrigger className="w-full sm:w-44">
            <span>
              {SORT_OPTIONS.find((o) => o.value === sortKey)?.label ??
                'Mais recentes'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
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

      {/* Progress indicator */}
      {!isLoading && total > 0 && (
        <p className="text-sm text-muted-foreground">
          Exibindo {formatTotal(allReviews.length)} de {formatTotal(total)}{' '}
          avaliações
        </p>
      )}

      {/* Reviews list */}
      {viewMode === 'expanded' ? (
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
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60">
          {isLoading && (
            <div className="space-y-1 p-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {!isLoading && allReviews.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <MessageSquare className="mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Nenhuma avaliação encontrada para os filtros selecionados.
              </p>
            </div>
          )}

          {allReviews.length > 0 && (
            <div className="divide-y divide-border/60">
              {allReviews.map((review) => (
                <ReviewCompactRow
                  key={review.review_id}
                  review={review}
                  onClick={() => setSelectedReviewId(review.review_id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

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
