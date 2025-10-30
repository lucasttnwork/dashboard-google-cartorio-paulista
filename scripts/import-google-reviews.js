#!/usr/bin/env node
/*
 * Script de importação de reviews Google a partir de um arquivo JSON offline.
 * Usa a mesma normalização da função auto-collector (Apify) e insere/atualiza
 * os dados no Supabase garantindo ausência de duplicidades.
 */

require("dotenv").config({ path: ".env" })

// Permite reutilizar módulos TypeScript compartilhados (normalizador Apify)
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "Node" })
require("ts-node/register/transpile-only")

const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { createClient } = require("@supabase/supabase-js")

const { normalizeApifyReviews } = require("../supabase/functions/_shared/apify-normalizer.ts")

const DEFAULT_LOCATION_ID = "cartorio-paulista-location"
const CHUNK_SIZE = Number(process.env.IMPORT_BATCH_SIZE ?? 50)
const LOOKUP_CHUNK_SIZE = Number(process.env.IMPORT_LOOKUP_BATCH_SIZE ?? 20)

function ensureEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`❌ Variável de ambiente obrigatória ausente: ${name}`)
    process.exit(1)
  }
  return value
}

const SUPABASE_URL = ensureEnv("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = ensureEnv("SUPABASE_SERVICE_ROLE_KEY")

const locationId = process.env.LOCATION_ID ?? DEFAULT_LOCATION_ID

const inputArg = process.argv[2]
const inputFile = inputArg
  ? path.resolve(process.cwd(), inputArg)
  : path.resolve(__dirname, "..", "Scrape-google-reviews-upto-26-09-25.json")

/**
 * Lê e parseia o arquivo JSON contendo reviews exportados.
 */
function loadDataset(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Arquivo não encontrado: ${filePath}`)
    process.exit(1)
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8")
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) {
      throw new Error("Formato inválido: esperado array de reviews")
    }
    return data
  } catch (error) {
    console.error("❌ Falha ao ler JSON:", error.message)
    process.exit(1)
  }
}

function chunkArray(list, size) {
  const chunks = []
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size))
  }
  return chunks
}

/**
 * Quando o normalizador gera IDs aleatórios (fallback apify-*) por ausência
 * de review_id, substituímos por uma hash determinística do review_url, caso exista.
 */
function ensureDeterministicIds(reviews) {
  for (const review of reviews) {
    if (review.review_id && !/^(apify-|url-)/.test(review.review_id)) continue
    if (review.review_url) {
      const hash = crypto.createHash("sha256").update(review.review_url).digest("hex")
      review.review_id = `url-${hash}`
    }
  }
}

async function ensureLocationMetadata(client, sampleReview) {
  return
}

function splitForLookup(values) {
  const chunks = []
  for (let i = 0; i < values.length; i += LOOKUP_CHUNK_SIZE) {
    chunks.push(values.slice(i, i + LOOKUP_CHUNK_SIZE))
  }
  return chunks
}

async function fetchExistingMaps(client, reviews) {
  const ids = Array.from(new Set(reviews.map((r) => r.review_id).filter(Boolean)))
  const urls = Array.from(
    new Set(
      reviews
        .map((r) => r.review_url)
        .filter((url) => typeof url === "string" && url.trim().length > 0),
    ),
  )

  const existingMap = new Map()
  const existingUrlMap = new Map()

  for (const batch of splitForLookup(ids)) {
    const { data, error } = await client
      .from("reviews")
      .select("review_id, review_url")
      .in("review_id", batch)

    if (error) throw error
    for (const row of data ?? []) {
      existingMap.set(row.review_id, row)
      if (row.review_url) {
        existingUrlMap.set(row.review_url, row)
      }
    }
  }

  for (const batch of splitForLookup(urls)) {
    const { data, error } = await client
      .from("reviews")
      .select("review_id, review_url")
      .in("review_url", batch)

    if (error) throw error
    for (const row of data ?? []) {
      if (!existingMap.has(row.review_id)) {
        existingMap.set(row.review_id, row)
      }
      if (row.review_url) {
        existingUrlMap.set(row.review_url, row)
      }
    }
  }

  return { existingMap, existingUrlMap }
}

async function upsertChunk(client, reviewsChunk) {
  const nowIso = new Date().toISOString()

  const { existingMap, existingUrlMap } = await fetchExistingMaps(client, reviewsChunk)

  let newCount = 0
  let updatedCount = 0

  for (const review of reviewsChunk) {
    if (!existingMap.has(review.review_id) && review.review_url) {
      const byUrl = existingUrlMap.get(review.review_url)
      if (byUrl) {
        review.review_id = byUrl.review_id
      }
    }

    if (existingMap.has(review.review_id)) {
      updatedCount += 1
    } else {
      newCount += 1
      existingMap.set(review.review_id, { review_id: review.review_id, review_url: review.review_url })
      if (review.review_url) {
        existingUrlMap.set(review.review_url, { review_id: review.review_id, review_url: review.review_url })
      }
    }
  }

  const rawPayload = reviewsChunk.map((review) => ({
    review_id: review.review_id,
    location_id: review.location_id,
    payload: review.raw_payload,
    received_at: nowIso,
    last_seen_at: review.last_seen_at ?? review.update_time ?? review.create_time ?? nowIso,
  }))

  const normalizedPayload = reviewsChunk.map((review) => ({
    review_id: review.review_id,
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
    last_seen_at: review.last_seen_at ?? review.update_time ?? review.create_time ?? nowIso,
    source: review.source ?? "apify",
  }))

  const { error: rawError } = await client
    .from("reviews_raw")
    .upsert(rawPayload, { onConflict: "review_id", returning: "minimal" })
  if (rawError) throw rawError

  const { error: normError } = await client
    .from("reviews")
    .upsert(normalizedPayload, { onConflict: "review_id", returning: "minimal" })
  if (normError) throw normError

  return { newCount, updatedCount }
}

async function updateLocationMetrics(client) {
  const { data, error } = await client
    .from("reviews")
    .select("rating, create_time, update_time, last_seen_at")
    .eq("location_id", locationId)
    .eq("source", "apify")

  if (error) {
    console.warn("⚠️ Não foi possível calcular métricas da localização:", error.message)
    return
  }

  const rows = data ?? []
  const totalReviews = rows.length

  const ratings = rows
    .map((row) => row.rating)
    .filter((value) => typeof value === "number" && Number.isFinite(value))

  const avgRating = ratings.length
    ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
    : null

  const latestTimestamp = rows.reduce((latest, row) => {
    const candidate = row.last_seen_at ?? row.update_time ?? row.create_time ?? null
    if (!candidate) return latest
    if (!latest) return candidate
    const candidateMs = Date.parse(candidate)
    const latestMs = Date.parse(latest)
    if (Number.isNaN(candidateMs)) return latest
    if (Number.isNaN(latestMs)) return candidate
    return candidateMs > latestMs ? candidate : latest
  }, null)

  const syncTimestamp = latestTimestamp ?? new Date().toISOString()

  const { error: updateError } = await client
    .from("gbp_locations")
    .update({
      total_reviews_count: totalReviews,
      current_rating: avgRating,
      last_review_sync: syncTimestamp,
    })
    .eq("location_id", locationId)

  if (updateError) {
    console.warn("⚠️ Falha ao atualizar métricas da localização:", updateError.message)
  }
}

async function main() {
  console.info("📥 Iniciando importação de reviews do arquivo:", inputFile)

  const rawDataset = loadDataset(inputFile)
  console.info(`➡️  ${rawDataset.length} registros brutos encontrados.`)

  const normalized = normalizeApifyReviews(rawDataset, locationId)
  ensureDeterministicIds(normalized)

  console.info(`🔄 Após normalização/rest dedupe: ${normalized.length} reviews.`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const chunks = chunkArray(normalized, CHUNK_SIZE)

  let totalNew = 0
  let totalUpdated = 0
  let totalIterations = 0

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    const { newCount, updatedCount } = await upsertChunk(supabase, chunk)
    totalNew += newCount
    totalUpdated += updatedCount
    totalIterations += 1
    console.info(
      `✅ Lote ${index + 1}/${chunks.length}: ${chunk.length} reviews processados (novos: ${newCount}, existentes atualizados: ${updatedCount}).`,
    )
  }

  await updateLocationMetrics(supabase)

  console.info("🏁 Importação concluída com sucesso!")
  console.info(`📊 Novos registros: ${totalNew}`)
  console.info(`♻️  Atualizados/Reconfirmados: ${totalUpdated}`)
  console.info(`🔁 Execuções de lote: ${totalIterations}`)
}

main().catch((error) => {
  console.error("❌ Falha geral na importação:", error)
  process.exit(1)
})


