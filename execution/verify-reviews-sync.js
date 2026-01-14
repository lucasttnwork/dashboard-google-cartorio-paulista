/**
 * Layer 3 (Execution): Verify reviews synchronization
 * Verifica resultados do upsert de reviews
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function verifySync() {
  console.log('🔍 Verificando sincronização de reviews...\n');

  // Contar total de reviews
  const { count: totalCount, error: countError } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Erro ao contar reviews:', countError.message);
    return;
  }

  console.log(`📊 Total de reviews no banco: ${totalCount}`);

  // Contar reviews de hoje
  const today = new Date().toISOString().split('T')[0];
  const { count: todayCount } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .gte('create_time', `${today}T00:00:00`);

  console.log(`📅 Reviews de hoje: ${todayCount}`);

  // Últimos 5 reviews
  console.log('\n🆕 Últimos 5 reviews inseridos:');
  console.log('─'.repeat(100));

  const { data: latestReviews, error: latestError } = await supabase
    .from('reviews')
    .select('review_id, reviewer_name, rating, create_time')
    .order('create_time', { ascending: false })
    .limit(5);

  if (!latestError && latestReviews) {
    latestReviews.forEach((review, i) => {
      const date = new Date(review.create_time).toLocaleString('pt-BR');
      console.log(`${i + 1}. ${review.reviewer_name || '[Anônimo]'} - ⭐${review.rating} - ${date}`);
    });
  }

  // Estatísticas por rating
  console.log('\n📈 Distribuição de ratings:');
  console.log('─'.repeat(100));

  for (let rating = 5; rating >= 1; rating--) {
    const { count } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('rating', rating);

    const percentage = totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : 0;
    const bar = '█'.repeat(Math.floor(percentage / 2));
    console.log(`${'⭐'.repeat(rating).padEnd(10)} ${count.toString().padStart(5)} (${percentage}%) ${bar}`);
  }

  console.log('\n✅ Verificação concluída!');
}

verifySync().catch(error => {
  console.error('❌ Erro durante verificação:', error.message);
  process.exit(1);
});
