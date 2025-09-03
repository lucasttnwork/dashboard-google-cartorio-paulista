const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração do Supabase (mesma do restante do projeto)
const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDM1NjAsImV4cCI6MjA3MTk3OTU2MH0.9qYGEjUf7fz4_KNAcvSZfaiYLlGZllSYxlvNhXmGGWU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Identificação do local no banco (já existente)
const LOCATION = {
  location_id: 'cartorio_paulista_main',
  place_id: 'ChIJPXbxB0ZYzpQR-6-w9dl9lSI'
};

// Caminho do arquivo com as últimas 5 semanas
const DATA_FILE = path.join(__dirname, 'google-maps-scraper-tool', 'cartorio-paulista-5-semanas.json');

function computeCreateTime(dataColetaIso, diasAtras) {
  const coleta = new Date(dataColetaIso);
  if (Number.isFinite(Number(diasAtras))) {
    const ms = coleta.getTime() - Number(diasAtras) * 24 * 60 * 60 * 1000;
    return new Date(ms).toISOString();
  }
  return coleta.toISOString();
}

function generateStableReviewId(nome, comentario, createTimeIso) {
  const basis = `${nome || ''}__${(comentario || '').slice(0, 120)}__${createTimeIso}`;
  return `gbp_5w_${Buffer.from(basis).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`;
}

async function upsertFromReview(raw, batchId) {
  const reviewerName = raw.nome || 'Usuário';
  const rating = Number(raw.rating) || 5;
  const comment = typeof raw.comentario === 'string' ? raw.comentario : null;
  const createTime = computeCreateTime(raw.data_coleta || new Date().toISOString(), raw.dias_atras ?? null);
  const reviewId = generateStableReviewId(reviewerName, comment, createTime);

  // Inserção em reviews_raw
  const { error: rawErr } = await supabase
    .from('reviews_raw')
    .upsert({
      review_id: reviewId,
      location_id: LOCATION.location_id,
      payload: {
        source: 'google_scrape_5_weeks',
        place_id: LOCATION.place_id,
        nome: reviewerName,
        rating,
        comentario: comment,
        data_texto: raw.data_texto || null,
        dias_atras: raw.dias_atras ?? null,
        data_coleta: raw.data_coleta || null
      }
    }, { onConflict: 'review_id' });
  if (rawErr) {
    // Se RLS bloquear, seguimos apenas com a inserção normalizada
    const isRls = /row-level security/i.test(rawErr.message) || /RLS/i.test(rawErr.message);
    if (!isRls) {
      throw new Error(`Falha no reviews_raw: ${rawErr.message}`);
    }
    console.warn(`⚠️ RLS bloqueou reviews_raw para ${reviewId}. Continuando apenas com reviews.`);
  }

  // Inserção/atualização em reviews (normalizado)
  const normalized = {
    review_id: reviewId,
    location_id: LOCATION.location_id,
    rating,
    comment,
    reviewer_name: reviewerName,
    is_anonymous: !reviewerName || reviewerName.toLowerCase().includes('usuário'),
    create_time: createTime,
    update_time: null,
    reply_text: null,
    reply_time: null,
    collection_source: 'five_weeks_import',
    collection_batch_id: batchId,
    processed_at: new Date().toISOString()
  };

  const { error: normErr } = await supabase
    .from('reviews')
    .upsert(normalized, { onConflict: 'review_id' });
  if (normErr) throw new Error(`Falha no reviews: ${normErr.message}`);

  return { reviewId };
}

async function main() {
  console.log('🚀 Importando últimas 5 semanas para o Supabase');

  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ Arquivo não encontrado:', DATA_FILE);
    process.exit(1);
  }

  const rawText = fs.readFileSync(DATA_FILE, 'utf8');
  let json;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    console.error('❌ Conteúdo inválido (JSON parse):', e.message);
    process.exit(1);
  }

  const reviews = Array.isArray(json.reviews) ? json.reviews : [];
  if (reviews.length === 0) {
    console.warn('⚠️ Nenhuma review encontrada no arquivo.');
    process.exit(0);
  }

  const batchId = `five_weeks_${Date.now()}`;
  console.log('📦 Batch ID:', batchId);
  console.log('📊 Total no arquivo:', reviews.length);

  let success = 0;
  let failures = 0;

  for (const r of reviews) {
    try {
      await upsertFromReview(r, batchId);
      success++;
      if (success % 50 === 0) console.log(`✅ ${success} inseridos...`);
    } catch (err) {
      failures++;
      console.error('❌ Falha ao inserir uma review:', err.message);
    }
  }

  console.log('\n✅ Importação finalizada.');
  console.log(`   ✔️ Sucessos: ${success}`);
  console.log(`   ❌ Falhas:   ${failures}`);
  console.log(`   🔖 Batch ID: ${batchId}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Erro inesperado:', err.message);
    process.exit(1);
  });
}


