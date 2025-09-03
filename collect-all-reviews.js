const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDM1NjAsImV4cCI6MjA3MTk3OTU2MH0.9qYGEjUf7fz4_KNAcvSZfaiYLlGZllSYxlvNhXmGGWU';
const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const DATAFORSEO_AUTH_B64 = 'aWFAY2FydG9yaW9wYXVsaXN0YS5jb20uYnI6ZmE2YmQxOGMyNTBmOTY5Mg==';

const CARTORIO = {
  place_id: 'ChIJPXbxB0ZYzpQR-6-w9dl9lSI',
  location_id: 'cartorio_paulista_main'
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchBatch(nextToken) {
  const body = [{
    place_id: CARTORIO.place_id,
    language_name: 'Portuguese',
    sort_by: 'newest',
    depth: 100,
    ...(nextToken ? { next_token: nextToken } : {})
  }];

  const res = await fetch(`${DATAFORSEO_BASE}/business_data/google/reviews/live/advanced`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${DATAFORSEO_AUTH_B64}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok || data.status_code !== 20000) {
    throw new Error(data.status_message || `HTTP ${res.status}`);
  }

  const items = [];
  let next = null;
  if (data.tasks && data.tasks[0]?.result) {
    for (const result of data.tasks[0].result) {
      if (Array.isArray(result.items)) items.push(...result.items);
      if (result.next_token) next = result.next_token;
    }
  }
  return { items, next };
}

async function upsertReview(item, batchId) {
  const reviewId = `gbp_${Buffer.from(`${item.review_id || item.time || item.reviewer_name || Math.random()}`).toString('base64').replace(/[^a-zA-Z0-9]/g,'').slice(0, 40)}`;

  // Raw
  await supabase.from('reviews_raw').upsert({
    review_id: reviewId,
    location_id: CARTORIO.location_id,
    payload: item
  });

  // Normalized
  const normalized = {
    review_id: reviewId,
    location_id: CARTORIO.location_id,
    rating: item.rating?.value ?? item.rating ?? 5,
    comment: item.review_text ?? item.text ?? item.comment ?? null,
    reviewer_name: item.reviewer_name ?? item.author ?? 'Anônimo',
    is_anonymous: !(item.reviewer_name || item.author),
    create_time: item.timestamp ?? item.time ?? new Date().toISOString(),
    update_time: item.updated_timestamp ?? null,
    reply_text: item.reply?.text ?? null,
    reply_time: item.reply?.timestamp ?? null,
    collection_source: 'dataforseo_auto',
    collection_batch_id: batchId,
    processed_at: new Date().toISOString()
  };

  const { error } = await supabase.from('reviews').upsert(normalized);
  if (error) {
    console.error('Erro ao salvar review', reviewId, error.message);
  }
}

async function run() {
  console.log('🚀 Coleta completa de reviews (sem excluir os não correlacionados)');
  const batchId = `all_reviews_${Date.now()}`;

  let total = 0;
  let nextToken = undefined;

  for (let page = 1; page <= 10; page++) { // limite de 10 páginas (ajustável)
    try {
      const { items, next } = await fetchBatch(nextToken);
      console.log(`📥 Página ${page}: ${items.length} reviews`);
      for (const item of items) {
        await upsertReview(item, batchId);
        total++;
      }
      if (!next) break;
      nextToken = next;
    } catch (e) {
      console.error('❌ Falha ao buscar página', page, e.message);
      break;
    }
  }

  console.log(`✅ Coleta finalizada. Inseridos/atualizados: ${total}. Batch: ${batchId}`);

  // Resumo correlacionado vs não correlacionado
  const { data } = await supabase
    .from('reviews')
    .select('review_id')
    .eq('collection_batch_id', batchId);

  const ids = (data || []).map(r => r.review_id);
  let correlated = 0;
  if (ids.length) {
    const { data: links } = await supabase
      .from('review_collaborators')
      .select('review_id')
      .in('review_id', ids);
    correlated = links ? links.length : 0;
  }

  console.log(`📊 Resumo: total=${ids.length}, correlacionados=${correlated}, sem_correlação=${ids.length - correlated}`);
}

if (require.main === module) {
  run().catch(err => {
    console.error('Erro geral:', err);
    process.exit(1);
  });
}



