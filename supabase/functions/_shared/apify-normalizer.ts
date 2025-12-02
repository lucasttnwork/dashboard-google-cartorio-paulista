export type ApifyReview = Record<string, unknown>

export type NormalizedReview = {
  review_id: string
  location_id: string
  rating: number | null
  comment: string | null
  reviewer_name: string | null
  reviewer_id: string | null
  reviewer_url: string | null
  review_url: string | null
  is_local_guide: boolean | null
  reviewer_photo_url: string | null
  original_language: string | null
  translated_text: string | null
  create_time: string | null
  update_time: string | null
  response_text: string | null
  response_time: string | null
  last_seen_at: string | null
  source: "apify"
  raw_payload: Record<string, unknown>
}

type IsoLike = string | number | Date | null | undefined

const SOURCE: NormalizedReview["source"] = "apify"

export function normalizeApifyReviews(reviews: ApifyReview[], locationId: string): NormalizedReview[] {
  const seen = new Set<string>()
  const normalized: NormalizedReview[] = []

  for (const raw of reviews) {
    const mapped = normalizeApifyReview(raw, locationId)
    const dedupeKey = mapped.review_id || mapped.review_url
    if (!dedupeKey) continue
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    normalized.push(mapped)
  }

  return normalized
}

export function normalizeApifyReview(raw: ApifyReview, locationId: string): NormalizedReview {
  const reviewId = String(raw.review_id ?? raw.reviewId ?? raw.id ?? generateFallbackId())
  const ratingRaw = raw.rating ?? raw.stars ?? null
  const responseText = raw.responseText ?? raw.responseFromOwnerText ?? (raw.responseFromOwner as Record<string, unknown> | undefined)?.text ?? null

  const createTime = coalesceIsoDates(
    raw.publishedAtDate,
    raw.published_at_date,
    raw.publishAtDate,
    raw.publish_at_date,
    raw.publishedAt,
    raw.publishAt,
    raw.createdAt,
    raw.createTime,
    raw.created_time,
    raw.create_time,
  )

  const updateTime = coalesceIsoDates(
    raw.updatedAtDate,
    raw.updated_at_date,
    raw.updatedAt,
    raw.updateAt,
    raw.updateTime,
    raw.updated_time,
    raw.update_time,
    raw.modifiedAt,
    raw.modified_at,
  )

  const responseTime = coalesceIsoDates(
    raw.responseTime,
    raw.response_from_owner_time,
    raw.responseFromOwnerTime,
    raw.responseFromOwnerDate,
    raw.response_from_owner_date,
    (raw.responseFromOwner as Record<string, unknown> | undefined)?.publishedAt,
  )

  const lastSeenAt = coalesceIsoDates(
    raw.lastSeenAt,
    raw.last_seen_at,
    raw.scrapedAt,
    raw.scraped_at,
    raw.seenAt,
    raw.seen_at,
  )

  return {
    review_id: reviewId,
    location_id: locationId,
    rating: toNumeric(ratingRaw),
    comment: toNullableString(raw.comment ?? raw.text),
    reviewer_name: toNullableString(raw.name ?? raw.reviewerName),
    reviewer_id: toNullableString(raw.reviewer_id ?? raw.reviewerId),
    reviewer_url: toNullableString(raw.reviewer_url ?? raw.reviewerUrl),
    review_url: toNullableString(raw.review_url ?? raw.reviewUrl),
    is_local_guide: toNullableBoolean(raw.is_local_guide ?? raw.isLocalGuide),
    reviewer_photo_url: toNullableString(raw.reviewerPhotoUrl ?? raw.reviewer_photo_url),
    original_language: toNullableString(raw.originalLanguage ?? raw.original_language),
    translated_text: toNullableString(raw.translatedText ?? raw.textTranslated),
    create_time: createTime,
    update_time: updateTime ?? createTime,
    response_text: toNullableString(responseText),
    response_time: responseTime,
    last_seen_at: lastSeenAt,
    source: SOURCE,
    raw_payload: toPayload(raw),
  }
}

function coalesceIsoDates(...values: IsoLike[]): string | null {
  for (const value of values) {
    const iso = toIsoDate(value)
    if (iso) return iso
  }
  return null
}

function toIsoDate(value: IsoLike): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? new Date(time).toISOString() : null
  }
  if (typeof value === "number") {
    const ms = value > 1_000_000_000_000 ? value : value * 1000
    if (!Number.isFinite(ms)) return null
    return new Date(ms).toISOString()
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Date.parse(trimmed)
    if (Number.isNaN(parsed)) return null
    return new Date(parsed).toISOString()
  }
  return null
}

function toNumeric(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }
  return null
}

function toNullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    if (!value) return null
    const normalized = value.toLowerCase()
    if (["true", "1", "yes", "y"].includes(normalized)) return true
    if (["false", "0", "no", "n"].includes(normalized)) return false
  }
  return null
}

function toPayload(raw: ApifyReview): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return {}
}

function generateFallbackId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `apify-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const __testables = {
  toIsoDate,
  toNumeric,
  toNullableBoolean,
  toNullableString,
  generateFallbackId,
}

