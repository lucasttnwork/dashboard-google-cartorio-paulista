require('dotenv').config({ path: './scraper/.env' })
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltam variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no scraper/.env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function toIso(input) {
  if (!input) return null
  const d = new Date(input)
  return isNaN(d) ? null : d.toISOString()
}

function mapRecord(r) {
  return {
    review_id: r.reviewId || r.reviewUrl || null,
    location_id: 'cartorio-paulista-location',
    rating: r.stars ?? r.rating ?? null,
    comment: r.text ?? null,
    reviewer_name: r.name ?? null,
    reviewer_id: r.reviewerId || null,
    reviewer_url: r.reviewerUrl || null,
    reviewer_photo_url: r.reviewerPhotoUrl || null,
    is_local_guide: !!r.isLocalGuide,
    original_language: r.originalLanguage || r.language || null,
    translated_text: r.textTranslated || null,
    review_url: r.reviewUrl || null,
    is_anonymous: false,
    create_time: toIso(r.publishedAtDate) || toIso(r.publishedAt) || null,
    update_time: toIso(r.scrapedAt) || toIso(r.publishedAtDate) || null,
    response_text: r.responseFromOwnerText || null,
    response_time: toIso(r.responseFromOwnerDate) || null,
    reply_text: r.responseFromOwnerText || null,
    reply_time: toIso(r.responseFromOwnerDate) || null,
    source: 'apify',
    _raw: r,
  }
}

async function upsertBatch(rows) {
  const payload = rows.map(x => ({
    review_id: x.review_id,
    location_id: x.location_id,
    rating: x.rating,
    comment: x.comment,
    reviewer_name: x.reviewer_name,
    reviewer_id: x.reviewer_id,
    reviewer_url: x.reviewer_url,
    reviewer_photo_url: x.reviewer_photo_url,
    is_local_guide: x.is_local_guide,
    original_language: x.original_language,
    translated_text: x.translated_text,
    review_url: x.review_url,
    is_anonymous: x.is_anonymous,
    create_time: x.create_time,
    update_time: x.update_time,
    response_text: x.response_text,
    response_time: x.response_time,
    reply_text: x.reply_text,
    reply_time: x.reply_time,
    source: x.source,
  }))

  if (payload.length === 0) return { count: 0 }

  const { error } = await supabase.from('reviews').upsert(payload, {
    onConflict: 'review_id',
    ignoreDuplicates: false,
  })
  if (error) throw new Error('reviews upsert: ' + error.message)
  return { count: payload.length }
}

async function insertRaw(rows) {
  const rawPayload = rows.map(x => ({ review_id: x.review_id, location_id: x.location_id, payload: x._raw }))
  const { error } = await supabase.from('reviews_raw').upsert(rawPayload, { onConflict: 'review_id' })
  if (error) throw new Error('reviews_raw upsert: ' + error.message)
}

async function main() {
  const file = process.argv[2] || 'dataset_Google-Maps-Reviews-Scraper_2025-09-17_12-03-32-701 (1).json'
  const full = path.resolve(file)
  const data = JSON.parse(fs.readFileSync(full, 'utf8'))

  // mapear
  const mapped = data.map(mapRecord)
    .filter(x => x.review_id && x.create_time) // garantir data para sorting

  // upsert em lotes
  const batchSize = 500
  let total = 0
  for (let i = 0; i < mapped.length; i += batchSize) {
    const chunk = mapped.slice(i, i + batchSize)
    const { count } = await upsertBatch(chunk)
    total += count
  }
  await insertRaw(mapped)

  console.log(`✅ Importação concluída. Registros processados: ${total}`)
}

if (require.main === module) {
  main().catch(err => {
    console.error('Erro na importação:', err)
    process.exit(1)
  })
}


