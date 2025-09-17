import { createClient } from '@supabase/supabase-js';
import { config } from './config/config.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey || config.supabase.anonKey);

async function reviewBatchAnalysis() {
  console.log('🔍 ANÁLISE DE LOTES DE IMPORTAÇÃO');
  console.log('=' .repeat(60));

  // Agrupar reviews por hora/minuto para identificar lotes
  const { data: allReviews, error } = await supabase
    .from('reviews')
    .select('review_id, reviewer_name, comment, rating, create_time')
    .eq('location_id', 'cartorio-paulista-location')
    .order('create_time', { ascending: false })
    .limit(2000);

  if (error) {
    console.error('❌ Erro:', error);
    return;
  }

  console.log(`📊 Analisando ${allReviews.length} reviews...\n`);

  // Agrupar por timestamp (minuto a minuto)
  const batches = {};
  allReviews.forEach(review => {
    if (review.create_time) {
      const date = new Date(review.create_time);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      if (!batches[key]) {
        batches[key] = [];
      }
      batches[key].push(review);
    }
  });

  console.log('📦 LOTES DE IMPORTAÇÃO IDENTIFICADOS:');
  console.log('-'.repeat(50));

  const batchStats = [];
  Object.keys(batches).sort().reverse().forEach(timestamp => {
    const batch = batches[timestamp];
    const withComments = batch.filter(r => r.comment && r.comment.trim() !== '').length;
    const commentRate = ((withComments / batch.length) * 100).toFixed(1);

    batchStats.push({
      timestamp,
      total: batch.length,
      withComments,
      commentRate: parseFloat(commentRate),
      avgCommentLength: withComments > 0 ?
        Math.round(batch.reduce((sum, r) => sum + (r.comment ? r.comment.length : 0), 0) / withComments) : 0
    });

    console.log(`${timestamp}:`);
    console.log(`   📊 ${batch.length} reviews`);
    console.log(`   💬 ${withComments} com comentários (${commentRate}%)`);
    console.log(`   📏 Tamanho médio: ${batchStats[batchStats.length - 1].avgCommentLength} chars`);
    console.log('---');
  });

  console.log('\n📈 ANÁLISE COMPARATIVA DOS LOTES:');
  console.log('-'.repeat(40));

  const bestBatch = batchStats.reduce((best, current) =>
    current.commentRate > best.commentRate ? current : best, batchStats[0]);

  const worstBatch = batchStats.reduce((worst, current) =>
    current.commentRate < worst.commentRate ? current : worst, batchStats[0]);

  console.log(`🏆 Melhor lote: ${bestBatch.timestamp}`);
  console.log(`   Taxa: ${bestBatch.commentRate}% (${bestBatch.withComments}/${bestBatch.total})`);
  console.log(`   Média de tamanho: ${bestBatch.avgCommentLength} chars`);

  console.log(`📉 Pior lote: ${worstBatch.timestamp}`);
  console.log(`   Taxa: ${worstBatch.commentRate}% (${worstBatch.withComments}/${worstBatch.total})`);
  console.log(`   Média de tamanho: ${worstBatch.avgCommentLength} chars`);

  // Análise de qualidade geral
  const totalReviews = batchStats.reduce((sum, batch) => sum + batch.total, 0);
  const totalWithComments = batchStats.reduce((sum, batch) => sum + batch.withComments, 0);
  const overallRate = ((totalWithComments / totalReviews) * 100).toFixed(1);

  console.log('\n🌟 MÉTRICAS GERAIS:');
  console.log('-'.repeat(25));
  console.log(`Total de reviews: ${totalReviews}`);
  console.log(`Total com comentários: ${totalWithComments}`);
  console.log(`Taxa geral: ${overallRate}%`);
  console.log(`Número de lotes: ${batchStats.length}`);

  // Exemplos dos melhores comentários
  console.log('\n💎 EXEMPLOS DOS MELHORES COMENTÁRIOS:');
  console.log('-'.repeat(40));

  const bestBatchReviews = batches[bestBatch.timestamp];
  const bestComments = bestBatchReviews
    .filter(r => r.comment && r.comment.trim() !== '')
    .sort((a, b) => b.comment.length - a.comment.length)
    .slice(0, 3);

  bestComments.forEach((review, i) => {
    console.log(`${i + 1}. ${review.reviewer_name}:`);
    console.log(`   "${review.comment}"`);
    console.log(`   📏 ${review.comment.length} caracteres`);
    console.log('---');
  });

  // Recomendações
  console.log('\n💡 RECOMENDAÇÕES BASEADAS NA ANÁLISE:');
  console.log('-'.repeat(45));

  if (batchStats.length > 1) {
    console.log('• Identificados múltiplos lotes de importação');
    console.log(`• Melhor performance: ${bestBatch.timestamp} (${bestBatch.commentRate}%)`);
    console.log(`• Pior performance: ${worstBatch.timestamp} (${worstBatch.commentRate}%)`);
    console.log('• Considere investigar diferenças entre lotes');
  }

  if (parseFloat(overallRate) >= 80) {
    console.log('• ✅ Qualidade geral EXCELENTE');
  } else if (parseFloat(overallRate) >= 60) {
    console.log('• ✅ Qualidade geral BOA');
  } else {
    console.log('• ⚠️ Qualidade geral PREOCUPANTE - investigar fonte dos dados');
  }

  if (bestBatch.avgCommentLength > 50) {
    console.log('• ✅ Comentários são detalhados e informativos');
  } else {
    console.log('• ℹ️ Comentários tendem a ser curtos - pode indicar limitações da fonte');
  }
}

reviewBatchAnalysis().catch(console.error);
