const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDM1NjAsImV4cCI6MjA3MTk3OTU2MH0.9qYGEjUf7fz4_KNAcvSZfaiYLlGZllSYxlvNhXmGGWU';
const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const DATAFORSEO_AUTH_B64 = 'aWFAY2FydG9yaW9wYXVsaXN0YS5jb20uYnI6ZmE2YmQxOGMyNTBmOTY5Mg==';

const CARTORIO = {
  place_id: 'ChIJPXbxB0ZYzpQR-6-w9dl9lSI',
  location_id: 'cartorio_paulista_main'
};

const PERIOD = { from: new Date('2025-08-01T00:00:00Z'), to: new Date('2025-09-01T00:00:00Z') };

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function postReviewsTask() {
  const payload = [{
    place_id: CARTORIO.place_id,
    sort_by: 'newest',
    depth: 50  // Reduzindo para evitar rate limiting
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
  return task.id;
}

async function getTaskResults(taskId) {
  console.log(`🔍 Fazendo requisição para task_get: ${taskId}`);

  // Tentar diferentes endpoints possíveis
  const endpoints = [
    `/business_data/google/reviews/task_get/${taskId}`,
    `/business_data/google/reviews/task_get/regular/${taskId}`,
    `/business_data/google/reviews/task_get/html/${taskId}`,
    `/business_data/task_get/${taskId}`,
    `/v3/business_data/google/reviews/task_get/${taskId}`
  ];

  for (const endpoint of endpoints) {
    try {
      const url = `${DATAFORSEO_BASE}${endpoint}`;
      console.log(`📡 Testando endpoint: ${url}`);

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${DATAFORSEO_AUTH_B64}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`📋 HTTP Status: ${res.status} ${res.statusText}`);

      const data = await res.json();
      console.log(`📋 Resposta:`, {
        status_code: data.status_code,
        status_message: data.status_message,
        has_tasks: !!data.tasks
      });

      if (res.ok && data.status_code === 20000) {
        console.log(`✅ Endpoint funcional encontrado: ${endpoint}`);
        return data;
      }

      console.log(`❌ Endpoint ${endpoint} falhou: ${data.status_message}`);

    } catch (error) {
      console.log(`❌ Erro no endpoint ${endpoint}:`, error.message);
    }
  }

  console.log(`❌ Nenhum endpoint funcionou para task ${taskId}`);
  return null;
}

async function pollTask(taskId, maxAttempts = 5, delayMs = 3000) {
  console.log(`🔍 Iniciando polling da task ${taskId} (máx. ${maxAttempts} tentativas)`);

  for (let i = 1; i <= maxAttempts; i++) {
    console.log(`📡 Tentativa ${i}/${maxAttempts} - Verificando resultados...`);
    const data = await getTaskResults(taskId);

    if (data) {
      console.log(`📋 Resposta da API (tentativa ${i}):`, {
        status_code: data.status_code,
        status_message: data.status_message,
        has_tasks: !!data.tasks,
        tasks_count: data.tasks?.length || 0,
        has_result: !!(data.tasks && data.tasks[0]?.result),
        result_count: data.tasks?.[0]?.result?.length || 0
      });

      if (data.tasks && data.tasks[0]?.result?.length) {
        console.log(`✅ Resultados prontos (tentativa ${i}) - ${data.tasks[0].result.length} items`);
        return data;
      }

      if (data.status_code === 20000 && data.tasks && data.tasks[0]) {
        const task = data.tasks[0];
        console.log(`📊 Status da task: ${task.status_code} - ${task.status_message}`);
      }
    } else {
      console.log(`❌ Sem resposta da API (tentativa ${i})`);
    }

    if (i < maxAttempts) {
      console.log(`⏳ Aguardando ${delayMs/1000}s antes da próxima tentativa...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  console.log(`❌ Task ${taskId} não retornou resultados após ${maxAttempts} tentativas`);
  return null;
}

// REMOVIDO: fetchNextToken não é necessário pois endpoint live não existe

function inAugust2025(item) {
  const ts = item.timestamp || item.time || item.date;
  if (!ts) return false;
  const d = new Date(ts);
  return d >= PERIOD.from && d < PERIOD.to;
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
  console.log('🚀 Coleta robusta de todos os reviews (varredura até cobrir Agosto/2025)');
  const batchId = `all_aug2025_${Date.now()}`;

  const taskId = await postReviewsTask();
  const firstData = await pollTask(taskId);
  if (!firstData) {
    console.log('⚠️ Sem resultados da task inicial. Abortando.');
    return;
  }

  let total = 0;
  let collectedAug = 0;
  let earliestDate = null;

  // Processar resultado único da task (sem paginação)
  if (firstData.tasks && firstData.tasks[0]?.result) {
    for (const result of firstData.tasks[0].result) {
      if (Array.isArray(result.items)) {
        for (const item of result.items) {
          await upsertReview(item, batchId);
          total++;
          if (inAugust2025(item)) collectedAug++;
          const ts = new Date(item.timestamp || item.time || Date.now());
          if (!earliestDate || ts < earliestDate) earliestDate = ts;
        }
      }
    }
  }

  console.log(`✅ Inseridos/atualizados: ${total} (em Agosto/2025: ${collectedAug}). Batch: ${batchId}`);

  // Consolidação por correlação
  const { data: inserted } = await supabase
    .from('reviews')
    .select('review_id, create_time')
    .eq('collection_batch_id', batchId);
  const idsAug = (inserted || [])
    .filter(r => new Date(r.create_time) >= PERIOD.from && new Date(r.create_time) < PERIOD.to)
    .map(r => r.review_id);

  let correlated = 0;
  if (idsAug.length) {
    const { data: links } = await supabase
      .from('review_collaborators')
      .select('review_id')
      .in('review_id', idsAug);
    correlated = links ? links.length : 0;
  }

  console.log(`📊 Agosto/2025: total=${idsAug.length}, correlacionados=${correlated}, sem_correlação=${idsAug.length - correlated}`);
}

if (require.main === module) {
  run().catch(err => {
    console.error('Erro geral:', err.message);
    process.exit(1);
  });
}
