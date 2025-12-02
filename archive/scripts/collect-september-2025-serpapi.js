const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Supabase (mesmo padrão dos scripts existentes)
const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDM1NjAsImV4cCI6MjA3MTk3OTU2MH0.9qYGEjUf7fz4_KNAcvSZfaiYLlGZllSYxlvNhXmGGWU';

// SerpApi
const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';

// Alvo de negócio
const CARTORIO = {
  place_id: 'ChIJPXbxB0ZYzpQR-6-w9dl9lSI',
  cid: '2492036343902810107',
  location_id: 'cartorio_paulista_main'
};

// Período: 2025-09-01 00:00:00Z até agora
function startOfSeptUTC() { return new Date('2025-09-01T00:00:00Z'); }
function nowUTC() { return new Date(); }
const PERIOD = { from: startOfSeptUTC(), to: nowUTC() };

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function toISOUtc(date) {
  try {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch { return null; }
}

// Parsing de datas relativas (fallback apenas se não houver timestamp/unix_time)
function parseRelativeDate(text) {
  if (!text || typeof text !== 'string') return null;
  const now = new Date();
  const lower = text.trim().toLowerCase();

  // Casos rápidos
  if (/(hoje|today)/.test(lower)) return now.toISOString();
  if (/(ontem|yesterday)/.test(lower)) return new Date(now.getTime() - 24*60*60*1000).toISOString();

  // "há X unidade" ou "X unidade atrás" (pt/en)
  const relRegex = /(há\s+)?(\d+)\s+(minuto|minutos|minute|minutes|hora|horas|hour|hours|dia|dias|day|days|semana|semanas|week|weeks|mês|meses|month|months|ano|anos|year|years)(\s+atrás)?/;
  const m = lower.match(relRegex);
  if (!m) return null;
  const n = parseInt(m[2], 10);
  const unit = m[3];
  let deltaMs = 0;
  if (/minuto|minute/.test(unit)) deltaMs = n * 60 * 1000;
  else if (/hora|hour/.test(unit)) deltaMs = n * 60 * 60 * 1000;
  else if (/dia|day/.test(unit)) deltaMs = n * 24 * 60 * 60 * 1000;
  else if (/semana|week/.test(unit)) deltaMs = n * 7 * 24 * 60 * 60 * 1000;
  else if (/m[eê]s|month/.test(unit)) deltaMs = n * 30 * 24 * 60 * 60 * 1000;
  else if (/ano|year/.test(unit)) deltaMs = n * 365 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - deltaMs).toISOString();
}

function getReviewTimestampISO(review) {
  // Preferir timestamps exatos
  if (typeof review.unix_time === 'number') {
    const d = new Date(review.unix_time * 1000);
    const iso = toISOUtc(d);
    if (iso) return iso;
  }
  if (review.timestamp && !isNaN(new Date(review.timestamp))) {
    const iso = toISOUtc(review.timestamp);
    if (iso) return iso;
  }
  if (review.time && !isNaN(new Date(review.time))) {
    const iso = toISOUtc(review.time);
    if (iso) return iso;
  }
  if (review.date && !isNaN(new Date(review.date))) {
    const iso = toISOUtc(review.date);
    if (iso) return iso;
  }
  // Fallback: data relativa textual (pt/en)
  const rel = parseRelativeDate(review.date || review.time);
  if (rel) return rel;
  return null;
}

function buildStableId(review, isoTs) {
  const authorRef = review.author_url || review.author_link || review.author_profile_url || review.reviewer_url || review.reviewer_link || review.reviewer_name || 'anon';
  const ratingRef = review.rating || review.stars || '';
  const comment = (review.text || review.comment || review.snippet || review.review_text || '')
    .toString()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
  const basis = `${authorRef}|${isoTs || ''}|${ratingRef}|${comment}`;
  const hash = crypto.createHash('sha1').update(basis).digest('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
  return `serpapi_${hash}`;
}

function isInPeriod(isoTs) {
  if (!isoTs) return false;
  const d = new Date(isoTs);
  return d >= PERIOD.from && d <= PERIOD.to;
}

async function fetchSerpApiPage(nextPageToken) {
  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set('engine', 'google_maps_reviews');
  url.searchParams.set('place_id', CARTORIO.place_id);
  url.searchParams.set('hl', 'pt-BR');
  url.searchParams.set('gl', 'br');
  url.searchParams.set('sort', 'newest');
  url.searchParams.set('api_key', SERPAPI_API_KEY);
  if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

  const res = await fetch(url.toString(), { method: 'GET' });
  const data = await res.json();
  if (!res.ok) {
    const msg = data && (data.error || data.message) ? `${res.status} ${data.error || data.message}` : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const items = Array.isArray(data.reviews)
    ? data.reviews
    : (Array.isArray(data.local_results) && data.local_results[0]?.reviews)
      ? data.local_results[0].reviews
      : [];

  const next = data.serpapi_pagination?.next_page_token || data.next_page_token || null;
  return { items, next };
}

async function upsertReview(review, batchId, isoTs) {
  const rawId = review.review_id || review.review_id_str || null;
  const reviewId = rawId || buildStableId(review, isoTs);

  // Raw
  await supabase.from('reviews_raw').upsert({
    review_id: reviewId,
    location_id: CARTORIO.location_id,
    payload: review
  });

  // Normalizado
  const normalized = {
    review_id: reviewId,
    location_id: CARTORIO.location_id,
    rating: review.rating ?? review.stars ?? 5,
    comment: review.text ?? review.comment ?? review.snippet ?? review.review_text ?? null,
    reviewer_name: review.reviewer_name ?? review.author_name ?? review.author ?? 'Anônimo',
    is_anonymous: !(review.reviewer_name || review.author_name || review.author),
    create_time: isoTs || new Date().toISOString(),
    update_time: null,
    reply_text: review.owner_response || review.reply_text || null,
    reply_time: null,
    collection_source: 'serpapi',
    collection_batch_id: batchId,
    processed_at: new Date().toISOString()
  };

  const { error } = await supabase.from('reviews').upsert(normalized);
  if (error) console.error('Erro ao salvar review', reviewId, error.message);
}

async function run() {
  if (!SERPAPI_API_KEY) {
    console.error('❌ SERPAPI_API_KEY não definida. No PowerShell, execute:');
    console.error("$env:SERPAPI_API_KEY = 'SUA_CHAVE_AQUI'");
    process.exit(1);
  }

  console.log(`🚀 Backfill SerpApi Setembro/2025 - ${PERIOD.from.toISOString()} a ${PERIOD.to.toISOString()}`);
  const batchId = `sep2025_serpapi_${Date.now()}`;

  let totalFetched = 0;
  let totalInsertedSept = 0;
  let nextToken = undefined;

  for (let page = 1; page <= 50; page++) {
    try {
      const { items, next } = await fetchSerpApiPage(nextToken);
      console.log(`📥 Página ${page}: ${items.length} reviews`);
      totalFetched += items.length;

      let pageHasSept = false;
      let pageHasNewerThanSept = false;
      let pageHasOlderThanSept = false;

      for (const review of items) {
        const isoTs = getReviewTimestampISO(review);
        if (!isoTs) continue;
        const d = new Date(isoTs);
        if (d > PERIOD.to) {
          pageHasNewerThanSept = true;
          continue;
        }
        if (d < PERIOD.from) {
          pageHasOlderThanSept = true;
          continue;
        }
        pageHasSept = true;
        await upsertReview(review, batchId, isoTs);
        totalInsertedSept++;
      }

      // Critério de parada: se a página corrente só tiver itens anteriores a 2025-09-01
      if (!pageHasSept && !pageHasNewerThanSept && pageHasOlderThanSept) {
        console.log('⏹️  Apenas itens anteriores a 2025-09-01 encontrados. Encerrando paginação.');
        break;
      }

      if (!next) break;
      nextToken = next;
    } catch (e) {
      console.error('❌ Falha ao buscar página', page, e.message);
      break;
    }
  }

  console.log(`✅ SerpApi completo. Buscados: ${totalFetched}, Inseridos Setembro: ${totalInsertedSept}. Batch: ${batchId}`);

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


