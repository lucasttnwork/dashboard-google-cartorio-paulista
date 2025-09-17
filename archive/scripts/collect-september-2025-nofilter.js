const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDM1NjAsImV4cCI6MjA3MTk3OTU2MH0.9qYGEjUf7fz4_KNAcvSZfaiYLlGZllSYxlvNhXmGGWU';
const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const DATAFORSEO_AUTH_B64 = 'aWFAY2FydG9yaW9wYXVsaXN0YS5jb20uYnI6ZmE2YmQxOGMyNTBmOTY5Mg==';

const CARTORIO = {
  place_id: 'ChIJPXbxB0ZYzpQR-6-w9dl9lSI',
  location_id: 'cartorio_paulista_main'
};

function startOfSeptUTC() { return new Date('2025-09-01T00:00:00Z'); }
function endOfTodayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
}
const PERIOD = { from: startOfSeptUTC(), to: endOfTodayUTC() };

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function postReviewsTask() {
  const payload = [{
    place_id: CARTORIO.place_id,
    language_name: 'Portuguese',
    sort_by: 'newest',
    depth: 200
  }];

  const res = await fetch(`${DATAFORSEO_BASE}/business_data/google/reviews/task_post`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${DATAFORSEO_AUTH_B64}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok || data.status_code !== 20000 || !data.tasks?.length) {
    throw new Error(data.status_message || `HTTP ${res.status}`);
  }
  const task = data.tasks[0];
  if (task.status_code !== 20100) {
    return { taskId: task.id, immediate: data };
  }
  return { taskId: task.id, immediate: null };
}

async function getTaskResults(taskId) {
  const endpoints = [
    `/business_data/google/reviews/task_get/advanced/${taskId}`,
    `/business_data/google/reviews/task_get/${taskId}`,
    `/business_data/task_get/${taskId}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${DATAFORSEO_BASE}${endpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${DATAFORSEO_AUTH_B64}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (res.ok && data.status_code === 20000) return data;
    } catch {}
  }
  return null;
}

async function pollTask(taskId, maxAttempts = 40, delayMs = 3000) {
  for (let i = 1; i <= maxAttempts; i++) {
    const data = await getTaskResults(taskId);
    if (data && data.tasks && data.tasks[0]?.result?.length) {
      console.log(`✅ Resultados prontos (tentativa ${i})`);
      return data;
    }
    console.log(`⏳ Aguardando resultados (tentativa ${i}/${maxAttempts})...`);
    await new Promise(r => setTimeout(r, delayMs));
  }
  return null;
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
  console.log(`🚀 Coleta Setembro/2025 sem filtros (filtrando localmente) - ${PERIOD.from.toISOString()} a ${PERIOD.to.toISOString()}`);
  const batchId = `sep2025_nofilter_${Date.now()}`;

  const { taskId, immediate } = await postReviewsTask();
  let data = immediate;
  if (!data) data = await pollTask(taskId);
  if (!data) {
    console.log('⚠️ Não foi possível obter resultados da task.');
    return;
  }

  let total = 0;
  let totalSept = 0;
  if (data.tasks && data.tasks[0]?.result) {
    for (const result of data.tasks[0].result) {
      const items = Array.isArray(result.items) ? result.items : [];
      for (const item of items) {
        const ts = new Date(item.timestamp || item.time || item.date || Date.now());
        if (ts >= PERIOD.from && ts <= PERIOD.to) {
          await upsertReview(item, batchId);
          totalSept++;
        }
        total++;
      }
    }
  }

  console.log(`✅ Reviews processados: ${total}. Em Setembro/2025: ${totalSept}. Batch: ${batchId}`);

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


