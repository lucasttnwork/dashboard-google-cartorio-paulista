import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { createLogger } from "../_shared/logger.ts"
import { getServiceClient } from "../_shared/db.ts"
import { normalizeApifyReviews, type ApifyReview, type NormalizedReview } from "../_shared/apify-normalizer.ts"

const logger = createLogger("auto-collector-apify")

const DEFAULT_LOCATION_ID = "cartorio-paulista-location"
const DEFAULT_LOOKBACK_HOURS = 24
const DEFAULT_MAX_REVIEWS = 200

type ConfigSnapshot = {
  supabase_url?: string | null
  supabase_project?: string | null
  apify_token?: boolean
  apify_actor_id?: string | null
  apify_task_id?: string | null
  apify_dataset_id?: string | null
  lookback_hours: number
  max_reviews: number
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabase = getServiceClient()
    const url = new URL(req.url)
    const payload = await safeJson(req)
    const action = inferAction(req.method, payload)

    switch (action) {
      case "status":
        return buildJson({
          status: "ok",
          config: getConfigSnapshot(),
          recent_runs: await getRecentRuns(supabase, 10),
        })

      case "run":
        return buildJson(await executeCollection(supabase, payload, url))

      default:
        return buildJson({ error: `Ação inválida: ${action}` }, 400)
    }
  } catch (error) {
    logger.error("Falha na auto-collector", { error: formatError(error) })
    return buildJson({ error: formatError(error) }, 500)
  }
})

type CollectorRun = {
  status: "completed" | "failed"
  reviews_found: number
  reviews_new: number
  reviews_updated: number
  execution_time_ms: number
  run_id: number | null
  apify_run_id?: string | null
  errors?: string[]
  location_id: string
}

async function executeCollection(supabase: ReturnType<typeof getServiceClient>, payload: Record<string, unknown> | null, url: URL) {
  const locationId = (payload?.location_id as string | undefined) ?? url.searchParams.get("location_id") ?? DEFAULT_LOCATION_ID
  const lookbackHours = numericEnv("APIFY_LOOKBACK_HOURS", DEFAULT_LOOKBACK_HOURS)
  const maxReviews = numericEnv("APIFY_MAX_REVIEWS", DEFAULT_MAX_REVIEWS)

  const apifyToken = Deno.env.get("APIFY_TOKEN")
  if (!apifyToken) {
    throw new Error("Variável de ambiente APIFY_TOKEN não configurada")
  }

  const apifyActorId = Deno.env.get("APIFY_ACTOR_ID") ?? undefined
  const apifyTaskId = Deno.env.get("APIFY_TASK_ID") ?? undefined
  const apifyDatasetId = Deno.env.get("APIFY_DATASET_ID") ?? undefined
  if (!apifyActorId && !apifyTaskId && !apifyDatasetId) {
    throw new Error("Configure APIFY_ACTOR_ID ou APIFY_TASK_ID (ou APIFY_DATASET_ID)")
  }

  const runRecord = await createCollectionRun(supabase, {
    location_id: locationId,
    run_type: payload?.source === "scheduler" ? "scheduled" : "manual",
    metadata: {
      source: payload?.source ?? "manual",
      lookback_hours: lookbackHours,
      max_reviews: maxReviews,
      apify_actor_id: apifyActorId,
      apify_task_id: apifyTaskId,
      apify_dataset_id: apifyDatasetId,
    },
  })

  const baseMetadata = mergeMetadata(runRecord?.metadata ?? {}, {
    source: payload?.source ?? "manual",
    lookback_hours: lookbackHours,
    max_reviews: maxReviews,
    apify_actor_id: apifyActorId,
    apify_task_id: apifyTaskId,
    apify_dataset_id: apifyDatasetId,
  })

  const startedAt = Date.now()
  const errors: string[] = []
  let reviews: NormalizedReview[] = []
  let apifyRunId: string | undefined

  try {
    const apifyResult = await fetchApifyReviews({
      token: apifyToken,
      actorId: apifyActorId,
      taskId: apifyTaskId,
      datasetId: apifyDatasetId,
      lookbackHours,
      maxReviews,
    })

    apifyRunId = apifyResult.apifyRunId
    reviews = normalizeApifyReviews(apifyResult.reviews, locationId)

    const { inserted, updated } = await persistReviews(supabase, reviews)
    await updateLocationMetrics(supabase, locationId)

    await finalizeCollectionRun(supabase, runRecord?.id ?? null, {
      status: "completed",
      reviews_found: reviews.length,
      reviews_new: inserted,
      reviews_updated: updated,
      execution_time_ms: Date.now() - startedAt,
      apify_run_id: apifyRunId ?? null,
    metadata: mergeMetadata(baseMetadata, {
      result: {
        status: "completed",
        reviews_found: reviews.length,
        reviews_new: inserted,
        reviews_updated: updated,
      },
    }),
    })

    return {
      status: "completed",
      reviews_found: reviews.length,
      reviews_new: inserted,
      reviews_updated: updated,
      execution_time_ms: Date.now() - startedAt,
      run_id: runRecord?.id ?? null,
      apify_run_id: apifyRunId ?? null,
      location_id: locationId,
    } satisfies CollectorRun
  } catch (error) {
    const message = formatError(error)
    errors.push(message)
    await finalizeCollectionRun(supabase, runRecord?.id ?? null, {
      status: "failed",
      execution_time_ms: Date.now() - startedAt,
      error_message: message,
      metadata: mergeMetadata(baseMetadata, {
        result: {
          status: "failed",
          reviews_found: reviews.length,
          reviews_new: 0,
          reviews_updated: 0,
          errors,
        },
      }),
    })

    return {
      status: "failed",
      reviews_found: reviews.length,
      reviews_new: 0,
      reviews_updated: 0,
      execution_time_ms: Date.now() - startedAt,
      run_id: runRecord?.id ?? null,
      apify_run_id: apifyRunId ?? null,
      errors,
      location_id: locationId,
    } satisfies CollectorRun
  }
}

async function fetchApifyReviews(params: {
  token: string
  actorId?: string
  taskId?: string
  datasetId?: string
  lookbackHours: number
  maxReviews: number
}): Promise<{ reviews: ApifyReview[]; apifyRunId?: string }> {
  const sinceIso = new Date(Date.now() - params.lookbackHours * 60 * 60 * 1000).toISOString()
  const inputPayload = {
    maxReviews: params.maxReviews,
    reviewsFromLastHours: params.lookbackHours,
    reviewsUpdatedAfter: sinceIso,
    sort: "NEWEST",
    includeReviewAnswers: true,
    includePhotos: false,
  }

  if (params.actorId) {
    return runApifyActor(params.token, params.actorId, inputPayload, sinceIso)
  }

  if (params.taskId) {
    return runApifyTask(params.token, params.taskId, inputPayload, sinceIso)
  }

  if (params.datasetId) {
    return loadApifyDataset(params.token, params.datasetId, sinceIso)
  }

  throw new Error("Nenhuma configuração Apify válida encontrada")
}


async function runApifyActor(token: string, actorId: string, input: Record<string, unknown>, sinceIso: string) {
  const res = await fetch(`https://api.apify.com/v2/actors/${actorId}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, build: "latest" }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Falha ao iniciar actor ${actorId}: ${res.status} ${text}`)
  }

  const run = await res.json()
  const runId = run?.data?.id ?? run?.id
  if (!runId) throw new Error("Actor Apify não retornou run id")

  logger.info("Actor Apify iniciado", { actorId, runId })

  const runDetails = await pollApifyRun(token, runId)
  if (runDetails.status !== "SUCCEEDED") {
    throw new Error(`Actor Apify finalizou com status ${runDetails.status}`)
  }

  if (!runDetails.defaultDatasetId) {
    throw new Error("Actor Apify não produziu dataset padrão")
  }

  const dataset = await loadApifyDataset(token, runDetails.defaultDatasetId, sinceIso)
  return { reviews: dataset.reviews, apifyRunId: runId }
}

async function runApifyTask(token: string, taskId: string, input: Record<string, unknown>, sinceIso: string) {
  const res = await fetch(`https://api.apify.com/v2/actor-tasks/${taskId}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Falha ao iniciar task ${taskId}: ${res.status} ${text}`)
  }

  const run = await res.json()
  const runId = run?.data?.id ?? run?.id
  if (!runId) throw new Error("Task Apify não retornou run id")

  logger.info("Task Apify iniciada", { taskId, runId })

  const runDetails = await pollApifyRun(token, runId)
  if (runDetails.status !== "SUCCEEDED") {
    throw new Error(`Task Apify finalizou com status ${runDetails.status}`)
  }

  if (!runDetails.defaultDatasetId) {
    throw new Error("Task Apify não produziu dataset padrão")
  }

  const dataset = await loadApifyDataset(token, runDetails.defaultDatasetId, sinceIso)
  return { reviews: dataset.reviews, apifyRunId: runId }
}

async function pollApifyRun(token: string, runId: string) {
  const endpoint = `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await fetch(endpoint, { headers: { Accept: "application/json" } })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Falha ao consultar run ${runId}: ${res.status} ${text}`)
    }
    const body = await res.json()
    const status = body?.data?.status ?? body?.status
    if (status && ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      return {
        status,
        defaultDatasetId: body?.data?.defaultDatasetId ?? body?.defaultDatasetId,
      }
    }
    await delay(3000)
  }
  throw new Error(`Run ${runId} excedeu tempo limite`)
}

async function loadApifyDataset(token: string, datasetId: string, sinceIso: string) {
  const url = new URL(`https://api.apify.com/v2/datasets/${datasetId}/items`)
  url.searchParams.set("token", token)
  url.searchParams.set("format", "json")
  url.searchParams.set("clean", "1")
  url.searchParams.set("unwind", "reviews")
  url.searchParams.set("from", sinceIso)

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Falha ao carregar dataset ${datasetId}: ${res.status} ${text}`)
  }

  const data = await res.json()
  const reviews: ApifyReview[] = Array.isArray(data) ? data : []
  return { reviews }
}

async function persistReviews(supabase: ReturnType<typeof getServiceClient>, reviews: NormalizedReview[]) {
  if (!reviews.length) {
    return { inserted: 0, updated: 0 }
  }

  type StoredReviewRow = {
    review_id: string
    review_url: string | null
    rating: number | null
    comment: string | null
    reviewer_name: string | null
    reviewer_id: string | null
    reviewer_url: string | null
    is_local_guide: boolean | null
    reviewer_photo_url: string | null
    original_language: string | null
    translated_text: string | null
    create_time: string | null
    update_time: string | null
    response_text: string | null
    response_time: string | null
    last_seen_at: string | null
  }

  const REVIEW_SELECT_COLUMNS = [
    "review_id",
    "review_url",
    "rating",
    "comment",
    "reviewer_name",
    "reviewer_id",
    "reviewer_url",
    "is_local_guide",
    "reviewer_photo_url",
    "original_language",
    "translated_text",
    "create_time",
    "update_time",
    "response_text",
    "response_time",
    "last_seen_at",
  ].join(", ")

  const COMPARISON_KEYS: Array<keyof StoredReviewRow> = [
    "review_url",
    "rating",
    "comment",
    "reviewer_name",
    "reviewer_id",
    "reviewer_url",
    "is_local_guide",
    "reviewer_photo_url",
    "original_language",
    "translated_text",
    "create_time",
    "update_time",
    "response_text",
    "response_time",
    "last_seen_at",
  ]

  const normalizeDbRow = (row: Partial<StoredReviewRow> & { review_id: string }): StoredReviewRow => ({
    review_id: row.review_id,
    review_url: row.review_url ?? null,
    rating: (row.rating ?? null) as number | null,
    comment: (row.comment ?? null) as string | null,
    reviewer_name: (row.reviewer_name ?? null) as string | null,
    reviewer_id: (row.reviewer_id ?? null) as string | null,
    reviewer_url: (row.reviewer_url ?? null) as string | null,
    is_local_guide: row.is_local_guide ?? null,
    reviewer_photo_url: (row.reviewer_photo_url ?? null) as string | null,
    original_language: (row.original_language ?? null) as string | null,
    translated_text: (row.translated_text ?? null) as string | null,
    create_time: (row.create_time ?? null) as string | null,
    update_time: (row.update_time ?? null) as string | null,
    response_text: (row.response_text ?? null) as string | null,
    response_time: (row.response_time ?? null) as string | null,
    last_seen_at: (row.last_seen_at ?? null) as string | null,
  })

  const snapshotFromReview = (review: NormalizedReview, reviewId: string, fallbackUrl: string | null): StoredReviewRow => ({
    review_id: reviewId,
    review_url: review.review_url ?? fallbackUrl ?? null,
    rating: review.rating ?? null,
    comment: review.comment ?? null,
    reviewer_name: review.reviewer_name ?? null,
    reviewer_id: review.reviewer_id ?? null,
    reviewer_url: review.reviewer_url ?? null,
    is_local_guide: review.is_local_guide ?? null,
    reviewer_photo_url: review.reviewer_photo_url ?? null,
    original_language: review.original_language ?? null,
    translated_text: review.translated_text ?? null,
    create_time: review.create_time ?? null,
    update_time: review.update_time ?? null,
    response_text: review.response_text ?? null,
    response_time: review.response_time ?? null,
    last_seen_at: review.last_seen_at ?? null,
  })

  const toComparable = (value: unknown) => (value === undefined ? null : value)

  const hasReviewChanges = (stored: StoredReviewRow, review: NormalizedReview): boolean => {
    for (const key of COMPARISON_KEYS) {
      const storedValue = toComparable(stored[key])
      const incomingValue = toComparable((review as Record<string, unknown>)[key])
      if (typeof storedValue === "number" && typeof incomingValue === "number") {
        if (Number.isNaN(storedValue) && Number.isNaN(incomingValue)) {
          continue
        }
      }
      if (storedValue !== incomingValue) {
        return true
      }
    }
    return false
  }

  const reviewIds = Array.from(new Set(reviews.map((r) => r.review_id)))
  const reviewUrls = Array.from(
    new Set(
      reviews
        .map((r) => r.review_url)
        .filter((url): url is string => typeof url === "string" && url.length > 0),
    ),
  )

  const [existingById, existingByUrl] = await Promise.all([
    supabase.from("reviews").select(REVIEW_SELECT_COLUMNS).in("review_id", reviewIds),
    reviewUrls.length
      ? supabase.from("reviews").select(REVIEW_SELECT_COLUMNS).in("review_url", reviewUrls)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (existingById.error) throw existingById.error
  if (existingByUrl.error) throw existingByUrl.error

  const existingMap = new Map<string, StoredReviewRow>()
  const existingUrlMap = new Map<string, StoredReviewRow>()

  const updateMaps = (entry: StoredReviewRow, previousUrl?: string | null) => {
    existingMap.set(entry.review_id, entry)
    if (previousUrl && previousUrl !== entry.review_url) {
      existingUrlMap.delete(previousUrl)
    }
    if (entry.review_url) {
      existingUrlMap.set(entry.review_url, entry)
    }
  }

  for (const row of existingById.data ?? []) {
    const normalized = normalizeDbRow(row as Partial<StoredReviewRow> & { review_id: string })
    updateMaps(normalized)
  }

  for (const row of existingByUrl.data ?? []) {
    const normalized = normalizeDbRow(row as Partial<StoredReviewRow> & { review_id: string })
    const existing = existingMap.get(normalized.review_id)
    if (existing) {
      if (normalized.review_url && !existingUrlMap.has(normalized.review_url)) {
        existingUrlMap.set(normalized.review_url, existing)
      }
    } else {
      updateMaps(normalized)
    }
  }

  let inserted = 0
  let updated = 0

  for (const review of reviews) {
    const storedById = existingMap.get(review.review_id)
    const storedByUrl = review.review_url ? existingUrlMap.get(review.review_url) : undefined
    const stored = storedById ?? storedByUrl

    const shouldInsert = !stored
    const shouldUpdate = stored ? hasReviewChanges(stored, review) : false

    if (!shouldInsert && !shouldUpdate) continue

    const targetReviewId = stored?.review_id ?? review.review_id

    const rawUpsert = await supabase
      .from("reviews_raw")
      .upsert({
        review_id: targetReviewId,
        location_id: review.location_id,
        payload: review.raw_payload,
        received_at: new Date().toISOString(),
        last_seen_at: review.last_seen_at ?? null,
      }, { onConflict: "review_id" })
    if (rawUpsert.error) throw rawUpsert.error

    const normUpsert = await supabase
      .from("reviews")
      .upsert({
        review_id: targetReviewId,
        location_id: review.location_id,
        rating: review.rating,
        comment: review.comment,
        reviewer_name: review.reviewer_name,
        reviewer_id: review.reviewer_id,
        reviewer_url: review.reviewer_url,
        review_url: review.review_url,
        is_local_guide: review.is_local_guide,
        reviewer_photo_url: review.reviewer_photo_url,
        original_language: review.original_language,
        translated_text: review.translated_text,
        create_time: review.create_time,
        update_time: review.update_time,
        response_text: review.response_text,
        response_time: review.response_time,
        last_seen_at: review.last_seen_at,
        source: review.source,
      }, { onConflict: "review_id" })
    if (normUpsert.error) throw normUpsert.error

    const snapshot = snapshotFromReview(review, targetReviewId, stored?.review_url ?? null)
    updateMaps(snapshot, stored?.review_url ?? null)

    if (shouldInsert) inserted += 1
    if (shouldUpdate) updated += 1
  }

  return { inserted, updated }
}

async function updateLocationMetrics(supabase: ReturnType<typeof getServiceClient>, locationId: string) {
  const stats = await supabase
    .from("reviews")
    .select("rating, create_time, update_time, last_seen_at")
    .eq("location_id", locationId)
    .eq("source", "apify")

  if (stats.error) {
    logger.warn("Não foi possível calcular métricas da localização", { error: stats.error.message })
    return
  }

  type ReviewMetricRow = {
    rating: number | null
    create_time: string | null
    update_time: string | null
    last_seen_at: string | null
  }

  const rows = (stats.data as ReviewMetricRow[]) ?? []
  const totalReviews = rows.length

  const ratingValues = rows
    .map((row) => row.rating)
    .filter((rating): rating is number => typeof rating === "number" && Number.isFinite(rating))
  const averageRating = ratingValues.length
    ? ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length
    : null

  const latestReviewTimestamp = rows.reduce((latest: string | null, row) => {
    const candidate = row.last_seen_at ?? row.update_time ?? row.create_time ?? null
    if (!candidate) return latest

    if (!latest) return candidate

    const candidateMs = Date.parse(candidate)
    const latestMs = Date.parse(latest)

    if (Number.isNaN(candidateMs)) return latest
    if (Number.isNaN(latestMs)) return candidate

    return candidateMs > latestMs ? candidate : latest
  }, null as string | null)

  const syncTimestamp = latestReviewTimestamp ?? new Date().toISOString()

  const update = await supabase
    .from("gbp_locations")
    .update({
      total_reviews_count: totalReviews,
      current_rating: averageRating,
      last_review_sync: syncTimestamp,
    })
    .eq("location_id", locationId)

  if (update.error) {
    logger.warn("Falha ao atualizar métricas da localização", { error: update.error.message })
  }
}

async function createCollectionRun(
  supabase: ReturnType<typeof getServiceClient>,
  payload: {
    location_id: string
    run_type: "manual" | "scheduled"
    metadata?: Record<string, unknown>
  },
) {
  const baseRecord = {
      location_id: payload.location_id,
      run_type: payload.run_type,
      status: "running",
      started_at: new Date().toISOString(),
      metadata: payload.metadata ?? {},
    }

  const res = await supabase
    .from("collection_runs")
    .insert(baseRecord)
    .select()
    .single()

  if (res.error) throw res.error
  return res.data
}

async function finalizeCollectionRun(
  supabase: ReturnType<typeof getServiceClient>,
  runId: number | null,
  payload: {
    status: "completed" | "failed"
    reviews_found?: number
    reviews_new?: number
    reviews_updated?: number
    execution_time_ms: number
    error_message?: string | null
    apify_run_id?: string | null
    metadata?: Record<string, unknown>
  },
) {
  if (!runId) return

  const updatePayload: Record<string, unknown> = {
      status: payload.status,
      completed_at: new Date().toISOString(),
      reviews_found: payload.reviews_found ?? null,
      reviews_new: payload.reviews_new ?? null,
      reviews_updated: payload.reviews_updated ?? null,
      execution_time_ms: payload.execution_time_ms,
      error_message: payload.error_message ?? null,
      apify_run_id: payload.apify_run_id ?? null,
  }

  if (payload.metadata) {
    updatePayload.metadata = payload.metadata
  }

  const res = await supabase
    .from("collection_runs")
    .update(updatePayload)
    .eq("id", runId)

  if (res.error) throw res.error
}

async function getRecentRuns(supabase: ReturnType<typeof getServiceClient>, limit: number) {
  const res = await supabase
    .from("collection_runs")
    .select("id, location_id, run_type, status, started_at, completed_at, reviews_found, reviews_new, reviews_updated, execution_time_ms, error_message, apify_run_id")
    .order("started_at", { ascending: false })
    .limit(limit)

  if (res.error) throw res.error
  return res.data ?? []
}

function inferAction(method: string, payload: Record<string, unknown> | null) {
  if (payload && typeof payload.action === "string") {
    const normalized = payload.action.toLowerCase()
    if (["run", "run_collection", "status", "check_status"].includes(normalized)) {
      return normalized === "run_collection" ? "run" : normalized
    }
  }
  return method === "GET" ? "status" : "run"
}

function mergeMetadata(
  base: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = Array.isArray(base)
    ? { value: base }
    : (base ? { ...base } : {})

  for (const [key, value] of Object.entries(patch)) {
    const existing = result[key]
    if (value && typeof value === "object" && !Array.isArray(value) && existing && typeof existing === "object" && !Array.isArray(existing)) {
      result[key] = mergeMetadata(existing as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }

  return result
}

function numericEnv(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name))
  return Number.isFinite(value) ? value : fallback
}

async function safeJson(req: Request): Promise<Record<string, unknown> | null> {
  if (req.method === "GET" || req.method === "OPTIONS") return null
  try {
    const text = await req.text()
    if (!text) return null
    return JSON.parse(text)
  } catch (error) {
    logger.warn("Falha ao parsear corpo JSON", { error: formatError(error) })
    return null
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  return typeof error === "string" ? error : JSON.stringify(error)
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildJson(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  })
}

function getConfigSnapshot(): ConfigSnapshot {
  return {
    supabase_url: Deno.env.get("SUPABASE_URL") ?? null,
    supabase_project: Deno.env.get("SUPABASE_PROJECT_REF") ?? null,
    apify_token: Boolean(Deno.env.get("APIFY_TOKEN")),
    apify_actor_id: Deno.env.get("APIFY_ACTOR_ID") ?? null,
    apify_task_id: Deno.env.get("APIFY_TASK_ID") ?? null,
    apify_dataset_id: Deno.env.get("APIFY_DATASET_ID") ?? null,
    lookback_hours: numericEnv("APIFY_LOOKBACK_HOURS", DEFAULT_LOOKBACK_HOURS),
    max_reviews: numericEnv("APIFY_MAX_REVIEWS", DEFAULT_MAX_REVIEWS),
  }
}
