import dotenv from 'dotenv'
import fs from 'fs'
import crypto from 'crypto'
import { SupabaseStorage } from '../storage/SupabaseStorage.js'
import { config } from '../config/config.js'
import { logger } from '../monitoring/logger.js'

dotenv.config()

function toIsoDate(val) {
  try {
    if (!val) return null

    const isPlausible = (d) => {
      if (!d || isNaN(d.getTime())) return false
      const year = d.getUTCFullYear()
      const nowYear = new Date().getUTCFullYear()
      return year >= 2004 && year <= nowYear + 1
    }

    if (typeof val === 'number') {
      // seconds or ms, ignore 0/negative
      const ms = val < 10_000_000_000 ? val * 1000 : val
      if (ms <= 0) return null
      const d = new Date(ms)
      return isPlausible(d) ? d.toISOString() : null
    }

    if (typeof val === 'string') {
      const parsed = parsePortugueseWhen(val)
      if (parsed) {
        const d = new Date(parsed)
        return isPlausible(d) ? d.toISOString() : null
      }
      const d = new Date(val)
      if (isPlausible(d)) return d.toISOString()
    }
  } catch {}
  return null
}

function cleanText(text) {
  if (!text || typeof text !== 'string') return ''
  return text.trim().replace(/\s+/g, ' ').substring(0, 2000)
}

function stableId(review) {
  const seed = [
    String(review.reviewer_name || ''),
    String(review.comment || ''),
    String(review.rating || '')
  ].join('|')
  const hash = crypto.createHash('sha256').update(seed).digest('hex')
  return `gbp_${hash.slice(0, 40)}`
}

function mapReview(r) {
  // Rating no JSON do extrator costuma vir como "Rating"
  const rating = Number(
    r?.Rating ?? r?.rating ?? r?.rating_value ?? r?.stars ?? r?.score ?? (r?.rating?.value)
  ) || 5
  // Comentário e nome nos campos "Description" e "Name"
  const comment = cleanText(r?.Description ?? r?.text ?? r?.review_text ?? r?.body ?? r?.comment ?? '')
  const reviewer_name = cleanText(r?.Name ?? r?.author_name ?? r?.author ?? r?.user ?? r?.name ?? 'Anonymous')
  // Data principal no campo "When" (ex.: 2025-08-15)
  const create_time = toIsoDate(r?.When ?? r?.time ?? r?.timestamp ?? r?.date)
  const update_time = toIsoDate(r?.updated_timestamp ?? null)

  const out = {
    review_id: 'temp', // replaced below
    location_id: config.gbp.locationId,
    rating,
    comment,
    reviewer_name,
    is_anonymous: reviewer_name.toLowerCase() === 'anonymous',
    create_time,
    update_time,
    reply_text: r?.reply?.text ?? null,
    reply_time: toIsoDate(r?.reply?.timestamp ?? null)
  }
  out.review_id = stableId(out)
  return out
}

// Converte strings de data relativas em pt-BR ("há 2 dias", "2 semanas atrás", "ontem", "hoje")
// e formatos comuns (dd/mm/yyyy, dd/mm/yy) para ISO.
function parsePortugueseWhen(input) {
  if (!input || typeof input !== 'string') return null
  const s = input.trim().toLowerCase()

  // hoje/ontem
  if (s === 'hoje') return new Date().toISOString()
  if (s === 'ontem') {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString()
  }

  // dd/mm/yyyy ou dd/mm/yy opcionalmente com hora
  const m = s.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (m) {
    let [ , dd, MM, yyyy, hh, mm ] = m
    let year = Number(yyyy)
    if (year < 100) year += 2000
    const date = new Date(Date.UTC(year, Number(MM) - 1, Number(dd), Number(hh||'0'), Number(mm||'0')))
    return isNaN(date.getTime()) ? null : date.toISOString()
  }

  // yyyy-m-d opcionalmente com hora
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (ymd) {
    const [ , yyyy, MM, dd, hh, mm ] = ymd
    const date = new Date(Date.UTC(Number(yyyy), Number(MM) - 1, Number(dd), Number(hh||'0'), Number(mm||'0')))
    return isNaN(date.getTime()) ? null : date.toISOString()
  }

  // Formato com mês por extenso: "15 de agosto de 2025" opcionalmente com hora "15:30"
  const meses = {
    'janeiro': 0, 'fevereiro': 1, 'março': 2, 'marco': 2, 'abril': 3, 'maio': 4, 'junho': 5,
    'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11
  }
  const ext = s.match(/^(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (ext) {
    const [ , dd, mesTxt, yyyy, hh, mm ] = ext
    const mesIdx = meses[mesTxt]
    if (mesIdx !== undefined) {
      const date = new Date(Date.UTC(Number(yyyy), mesIdx, Number(dd), Number(hh||'0'), Number(mm||'0')))
      return isNaN(date.getTime()) ? null : date.toISOString()
    }
  }

  // Expressões relativas: "há X unidade(s)" ou "X unidade(s) atrás"
  let rel = s
    .replace(/^há\s+/, '')
    .replace(/\s+atrás$/, '')
    .trim()

  // Tratar "menos de (um|uma) unidade"
  const less = rel.match(/^menos de\s+(um|uma)\s+(minuto|minutos|hora|horas|dia|dias|semana|semanas|mês|meses|ano|anos)$/)
  if (less) {
    rel = `1 ${less[2]}`
  }

  // Suportar "um/uma" como 1
  rel = rel.replace(/\buma\b/g, '1').replace(/\bum\b/g, '1')

  const rm = rel.match(/^(\d+)\s+(minuto|minutos|hora|horas|dia|dias|semana|semanas|mês|meses|ano|anos)$/)
  if (rm) {
    const qty = Number(rm[1])
    const unit = rm[2]
    const d = new Date()
    const map = {
      'minuto': () => d.setMinutes(d.getMinutes() - qty),
      'minutos': () => d.setMinutes(d.getMinutes() - qty),
      'hora': () => d.setHours(d.getHours() - qty),
      'horas': () => d.setHours(d.getHours() - qty),
      'dia': () => d.setDate(d.getDate() - qty),
      'dias': () => d.setDate(d.getDate() - qty),
      'semana': () => d.setDate(d.getDate() - 7 * qty),
      'semanas': () => d.setDate(d.getDate() - 7 * qty),
      'mês': () => d.setMonth(d.getMonth() - qty),
      'meses': () => d.setMonth(d.getMonth() - qty),
      'ano': () => d.setFullYear(d.getFullYear() - qty),
      'anos': () => d.setFullYear(d.getFullYear() - qty),
    }
    if (map[unit]) map[unit]()
    return d.toISOString()
  }

  return null
}

async function main() {
  const path = process.argv[2] || 'results.json'
  if (!fs.existsSync(path)) {
    console.error(`Arquivo não encontrado: ${path}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(path, 'utf8')
  const obj = JSON.parse(raw)

  const ext = Array.isArray(obj?.user_reviews_extended) ? obj.user_reviews_extended
    : Array.isArray(obj?.user_reviews) ? obj.user_reviews
    : []

  if (!ext.length) {
    console.log('Nenhuma review encontrada em user_reviews_extended/user_reviews')
    process.exit(0)
  }

  const storage = new SupabaseStorage()
  await storage.initialize()
  await storage.ensureGbpAccountAndLocation()

  // Deduplicar em memória por review_id antes de I/O
  const mapped = ext.map(mapReview)
  const uniqueMap = new Map()
  for (const r of mapped) {
    if (!uniqueMap.has(r.review_id)) uniqueMap.set(r.review_id, r)
  }
  const unique = Array.from(uniqueMap.values())

  logger.info(`📦 Preparando import de ${unique.length} reviews (únicas)...`)
  const results = await storage.saveReviews(unique)

  // Persist raw payloads (best-effort) para fallback de data: received_at
  try {
    const raws = ext.map((raw) => {
      const tmp = mapReview(raw)
      const maybeReceived = toIsoDate(raw?.received_at || null)
      const base = {
        review_id: tmp.review_id,
        location_id: tmp.location_id,
        payload: raw,
      }
      // Só incluir received_at se houver valor plausível; caso contrário, deixar Postgres aplicar DEFAULT now()
      return maybeReceived ? { ...base, received_at: maybeReceived } : base
    })
    await storage.saveRawPayloads(raws)
  } catch {}
  console.log(JSON.stringify({ saved: results.saved, duplicates: results.duplicates, errors: results.errors }, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})


