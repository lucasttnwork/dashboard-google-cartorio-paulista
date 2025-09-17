const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

// Configs para direcionar o scraper
process.env.NODE_ENV = process.env.NODE_ENV || 'production'
process.env.GBP_PLACE_ID = process.env.GBP_PLACE_ID || 'ChIJPXbxB0ZYzpQR-6-w9dl9lSI'
process.env.MAX_REVIEWS_PER_RUN = process.env.MAX_REVIEWS_PER_RUN || '20000'

function startOfSeptUTC() { return new Date('2025-09-01T00:00:00Z') }
function endOfTodayUTC() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))
}

function formatYYYYMMDD(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function inSeptember(iso) {
  if (!iso) return false
  const d = new Date(iso)
  return d >= startOfSeptUTC() && d <= endOfTodayUTC()
}

async function scrapeDomDeep(thresholdIso) {
  const esmPath = path.resolve('scraper/gbp/GBPScraper.js')
  const { GBPScraper } = await import(pathToFileURL(esmPath).href)
  const scraper = new GBPScraper()
  try {
    const all = await scraper.scrapeUntilDate(thresholdIso, { maxScrolls: 2000, extractEvery: 5 })
    return all
  } finally {
    await scraper.cleanup()
  }
}

async function run() {
  console.log('📡 Coletando via DOM (profundo) até 2025-09-01...')
  const all = await scrapeDomDeep('2025-09-01T00:00:00Z')
  console.log(`🔎 Total coletado (DOM profundo): ${all.length}`)

  const days = {}
  let total = 0
  for (const r of all) {
    const iso = r.create_time || null
    if (!inSeptember(iso)) continue
    const key = formatYYYYMMDD(new Date(iso))
    days[key] = (days[key] || 0) + 1
    total++
  }

  // Preencher todos os dias do mês até hoje
  const outLines = []
  const from = startOfSeptUTC()
  const to = endOfTodayUTC()
  const d = new Date(from)
  while (d <= to) {
    const key = formatYYYYMMDD(d)
    outLines.push(`${key}: ${days[key] || 0}`)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  outLines.push(`Total 2025-09 (DOM profundo): ${total}`)

  const outPath = path.resolve('daily_counts_dom_deep_2025-09.txt')
  fs.writeFileSync(outPath, outLines.join('\n'), 'utf8')
  console.log(`✅ Arquivo salvo: ${outPath}`)
}

if (require.main === module) {
  run().catch(err => {
    console.error('Erro no relatório DOM setembro (profundo):', err.message)
    process.exit(1)
  })
}


