const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDM1NjAsImV4cCI6MjA3MTk3OTU2MH0.9qYGEjUf7fz4_KNAcvSZfaiYLlGZllSYxlvNhXmGGWU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  // Pegar o batch SerpApi mais recente
  const { data: rows, error } = await supabase
    .from('reviews')
    .select('collection_batch_id')
    .ilike('collection_batch_id', 'sep2025_serpapi_%')
    .order('processed_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) {
    console.log('Nenhum batch SerpApi encontrado.');
    return;
  }
  const batchId = rows[0].collection_batch_id;
  console.log('Batch mais recente:', batchId);

  const { data: list, error: e2 } = await supabase
    .from('reviews')
    .select('review_id, create_time')
    .eq('collection_batch_id', batchId)
    .order('create_time', { ascending: false })
    .limit(10);
  if (e2) throw new Error(e2.message);

  const ids = (list || []).map(r => r.review_id);
  console.log('Amostra de review_ids:', ids);

  const { data: raws, error: e3 } = await supabase
    .from('reviews_raw')
    .select('review_id, payload')
    .in('review_id', ids);
  if (e3) throw new Error(e3.message);

  for (const row of raws || []) {
    const p = row.payload || {};
    const keys = Object.keys(p).filter(k => /time|date|unix/i.test(k));
    console.log('---');
    console.log('review_id:', row.review_id);
    console.log('date fields:', keys.reduce((acc, k) => (acc[k] = p[k], acc), {}));
    console.log('rating:', p.rating, 'author:', p.reviewer_name || p.author_name || p.author);
    console.log('sample text:', (p.text || p.comment || p.review_text || '').slice(0, 80));
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error('Erro:', err.message);
    process.exit(1);
  });
}


