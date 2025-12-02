const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDM1NjAsImV4cCI6MjA3MTk3OTU2MH0.9qYGEjUf7fz4_KNAcvSZfaiYLlGZllSYxlvNhXmGGWU';
const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const DATAFORSEO_AUTH_B64 = 'aWFAY2FydG9yaW9wYXVsaXN0YS5jb20uYnI6ZmE2YmQxOGMyNTBmOTY5Mg==';

const CARTORIO = {
  place_id: 'ChIJPXbxB0ZYzpQR-6-w9dl9lSI',
  location_id: 'cartorio_paulista_main'
};

function startOfSeptUTC() {
  return new Date('2025-09-01T00:00:00Z');
}
function endOfTodayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
}

const PERIOD = { from: startOfSeptUTC(), to: endOfTodayUTC() };

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

function inSeptember(item) {
  const ts = item.timestamp || item.time || item.date;
  if (!ts) return false;
  const d = new Date(ts);
  return d >= PERIOD.from && d <= PERIOD.to;
}

async function upsertReview(item, batchId) {
  const reviewId = `gbp_${Buffer.from(`${item.review_id || item.time || item.reviewer_name || Math.random()}`)
    .toString('base64').replace(/[^a-zA-Z0-9]/g,'').slice(0, 40)}`;

  await supabase.from('reviews_raw').upsert({
    review_id: reviewId,
    location_id: CARTORIO.location_id,
    payload: item
  });

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
  if (error) console.error('Erro ao salvar review', reviewId, error.message);
}

async function run() {
  console.log(`🚀 Backfill (LIVE) Setembro/2025 - ${PERIOD.from.toISOString()} a ${PERIOD.to.toISOString()}`);
  const batchId = `sep2025_live_${Date.now()}`;

  let totalFetched = 0;
  let totalInserted = 0;
  let nextToken = undefined;

  for (let page = 1; page <= 20; page++) {
    try {
      const { items, next } = await fetchBatch(nextToken);
      console.log(`📥 Página ${page}: ${items.length} itens`);
      totalFetched += items.length;

      let pageHasSept = false;
      let pageHasNewerThanSept = false;
      let pageHasOlderThanSept = false;

      for (const item of items) {
        const ts = new Date(item.timestamp || item.time || item.date || Date.now());
        if (ts >= PERIOD.from && ts <= PERIOD.to) {
          pageHasSept = true;
          await upsertReview(item, batchId);
          totalInserted++;
        } else if (ts > PERIOD.to) {
          pageHasNewerThanSept = true;
        } else if (ts < PERIOD.from) {
          pageHasOlderThanSept = true;
        }
      }

      // Se a página só tem itens mais antigos que o início de setembro, podemos parar
      if (!pageHasSept && !pageHasNewerThanSept && pageHasOlderThanSept) {
        console.log('⏹️  Apenas itens anteriores a Setembro encontrados. Encerrando paginação.');
        break;
      }

      if (!next) break;
      nextToken = next;
    } catch (e) {
      console.error('❌ Falha ao buscar página', page, e.message);
      break;
    }
  }

  console.log(`✅ LIVE completo. Buscados: ${totalFetched}, Inseridos Setembro: ${totalInserted}. Batch: ${batchId}`);

  const { data: sample } = await supabase
    .from('reviews')
    .select('review_id, rating, comment, reviewer_name, create_time')
    .eq('collection_batch_id', batchId)
    .order('create_time', { ascending: false })
    .limit(5);

  console.log('🔎 Amostra inserida (campos mínimos):');
  (sample || []).forEach((r, idx) => {
    console.log(`${idx + 1}. ⭐ ${r.rating} | ${r.reviewer_name} | ${r.create_time} | "${(r.comment || '').slice(0, 80)}"`);
  });
}

if (require.main === module) {
  run().catch(err => {
    console.error('Erro geral:', err.message);
    process.exit(1);
  });
}


