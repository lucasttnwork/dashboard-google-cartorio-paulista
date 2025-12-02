require('dotenv').config({ path: './scraper/.env' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltam SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY em scraper/.env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const CANONICAL_LOCATION = 'cartorio-paulista-location'

async function ensureCanonicalLocation({ place_id, cid, name, title, website, address, phone }) {
  // Busca existente
  const { data: existing, error: selErr } = await supabase
    .from('gbp_locations')
    .select('*')
    .eq('location_id', CANONICAL_LOCATION)
    .maybeSingle()
  if (selErr) throw selErr

  // Verificar conflitos por place_id/cid
  const conflicts = []
  if (place_id) conflicts.push({ col: 'place_id', val: place_id })
  if (cid) conflicts.push({ col: 'cid', val: cid })

  for (const c of conflicts) {
    const { data: dup, error: dupErr } = await supabase
      .from('gbp_locations')
      .select('location_id')
      .eq(c.col, c.val)
      .neq('location_id', CANONICAL_LOCATION)
    if (dupErr) throw dupErr
    // Zerar valores em duplicados para liberar constraint única
    for (const row of dup || []) {
      const upd = {}
      upd[c.col] = null
      const { error: updErr } = await supabase
        .from('gbp_locations')
        .update(upd)
        .eq('location_id', row.location_id)
      if (updErr) throw updErr
    }
  }

  if (!existing) {
    const { error } = await supabase.from('gbp_locations').insert({
      location_id: CANONICAL_LOCATION,
      account_id: 'cartorio-paulista',
      name, title, place_id, cid, website, address, phone,
    })
    if (error) throw error
  } else {
    const { error } = await supabase.from('gbp_locations').update({
      name, title, place_id, cid, website, address, phone,
    }).eq('location_id', CANONICAL_LOCATION)
    if (error) throw error
  }
}

async function archiveAndCleanupLegacy(apifyReviewIds, apifyReviewUrls) {
  const ids = Array.from(apifyReviewIds)
  const urls = Array.from(apifyReviewUrls)
  const { error } = await supabase.rpc('cleanup_legacy_from_dataset', {
    p_location_id: CANONICAL_LOCATION,
    p_ids: ids,
    p_urls: urls,
  })
  if (error) throw error
}

async function loadApifyContextFromFile(filePath) {
  const fs = require('fs')
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const ids = new Set()
  const urls = new Set()
  raw.forEach(r => {
    if (r.reviewId) ids.add(r.reviewId)
    if (r.reviewUrl) urls.add(r.reviewUrl)
  })
  return { ids, urls }
}

async function main() {
  const file = process.argv[2] || 'dataset_Google-Maps-Reviews-Scraper_2025-09-17_12-03-32-701 (1).json'

  // 1) Garantir location canônico (preencha place_id/cid corretos se já souber)
  await ensureCanonicalLocation({
    place_id: 'ChIJ_sample_place_id',
    cid: '12345678901234567890',
    name: 'Cartório Paulista',
    title: 'Cartório Paulista - 2º Cartório de Notas de São Paulo',
    website: 'https://cartoriopaulista.com.br',
    address: 'Rua da Liberdade, 123 - Liberdade, São Paulo - SP',
    phone: '(11) 3333-4444'
  })

  // 2) Ler dataset Apify e construir conjuntos de ids/urls
  const { ids, urls } = await loadApifyContextFromFile(file)

  // 3) Arquivar e limpar legacy
  await archiveAndCleanupLegacy(ids, urls)

  console.log('✅ Limpeza e canonicalização concluídas')
}

if (require.main === module) {
  main().catch(err => {
    console.error('Erro:', err)
    process.exit(1)
  })
}


