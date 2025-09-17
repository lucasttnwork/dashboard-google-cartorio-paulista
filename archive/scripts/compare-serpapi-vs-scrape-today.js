const crypto = require('crypto')
const path = require('path')
const { pathToFileURL } = require('url')

async function fetchSerpApiPages(maxPages = 5) {
  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey) throw new Error('SERPAPI_API_KEY não definida')
  const placeId = 'ChIJPXbxB0ZYzpQR-6-w9dl9lSI'
  const base = 'https://serpapi.com/search.json'

  const all = []
  let next = null
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(base)
    url.searchParams.set('engine', 'google_maps_reviews')
    url.searchParams.set('place_id', placeId)
    url.searchParams.set('hl', 'pt-BR')
    url.searchParams.set('gl', 'br')
    url.searchParams.set('sort', 'newest')
    url.searchParams.set('api_key', apiKey)
    if (next) url.searchParams.set('next_page_token', next)

    const res = await fetch(url.toString())
    const data = await res.json()
    const items = Array.isArray(data.reviews) ? data.reviews : []
    all.push(...items)
    next = data.serpapi_pagination?.next_page_token || null
    if (!next) break
  }
  return all
}

function toISOUtc(date) {
  try {
    const d = date instanceof Date ? date : new Date(date)
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch { return null }
}

function parseRelative(text) {
  if (!text || typeof text !== 'string') return null
  const now = new Date()
  const lower = text.toLowerCase()
  if (/(hoje|today)/.test(lower)) return now.toISOString()
  if (/(ontem|yesterday)/.test(lower)) return new Date(now.getTime() - 86400000).toISOString()
  const m = lower.match(/(há\s+)?(\d+)\s+(minuto|minutos|minute|minutes|hora|horas|hour|hours|dia|dias|day|days|semana|semanas|week|weeks|m[eê]s|meses|month|months|ano|anos|year|years)(\s+atrás)?/)
  if (!m) return null
  const n = parseInt(m[2], 10)
  const unit = m[3]
  let ms = 0
  if (/minuto|minute/.test(unit)) ms = n * 60000
  else if (/hora|hour/.test(unit)) ms = n * 3600000
  else if (/dia|day/.test(unit)) ms = n * 86400000
  else if (/semana|week/.test(unit)) ms = n * 7 * 86400000
  else if (/m[eê]s|month/.test(unit)) ms = n * 30 * 86400000
  else if (/ano|year/.test(unit)) ms = n * 365 * 86400000
  return new Date(Date.now() - ms).toISOString()
}

function getSerpApiISO(review) {
  if (typeof review.unix_time === 'number') return toISOUtc(new Date(review.unix_time * 1000))
  if (review.timestamp && !isNaN(new Date(review.timestamp))) return toISOUtc(review.timestamp)
  if (review.time && !isNaN(new Date(review.time))) return toISOUtc(review.time)
  if (review.date && !isNaN(new Date(review.date))) return toISOUtc(review.date)
  const rel = parseRelative(review.date || review.time)
  return rel
}

function isSameUtcDay(iso, refDate) {
  if (!iso) return false
  const d = new Date(iso)
  return d.getUTCFullYear() === refDate.getUTCFullYear()
    && d.getUTCMonth() === refDate.getUTCMonth()
    && d.getUTCDate() === refDate.getUTCDate()
}

async function scrapeDomToday() {
  // Dynamic import (ESM inside CJS) com file:// URL para Windows
  const esmPath = path.resolve('scraper/gbp/GBPScraper.js')
  const { GBPScraper } = await import(pathToFileURL(esmPath).href)
  const scraper = new GBPScraper()
  const reviews = await scraper.scrapeReviews()
  await scraper.cleanup()
  return reviews
}

async function run() {
  const today = new Date()
  const serp = await fetchSerpApiPages(8)
  const serpToday = serp.filter(r => isSameUtcDay(getSerpApiISO(r), today))

  const dom = await scrapeDomToday()
  const domToday = dom.filter(r => isSameUtcDay(r.create_time, today))

  console.log('📊 Comparativo HOJE (UTC):')
  console.log(`SerpApi (primeiras páginas): ${serpToday.length}`)
  console.log(`Scrape DOM (scroll): ${domToday.length}`)

  // top-level counts (sem filtrar HOJE)
  console.log(`Total bruto coletado SerpApi (amostra): ${serp.length}`)
  console.log(`Total bruto coletado DOM (amostra): ${dom.length}`)
}

if (require.main === module) {
  run().catch(err => {
    console.error('Erro no comparativo:', err.message)
    process.exit(1)
  })
}


