import { createClient } from '@supabase/supabase-js';
import { config } from './config/config.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey || config.supabase.anonKey);

async function finalComprehensiveAnalysis() {
  console.log('🎯 ANÁLISE FINAL COMPREENSIVA - AMOSTRA COMPLETA');
  console.log('=' .repeat(80));

  // 1. Verificar estatísticas totais do banco
  console.log('📊 1. ESTATÍSTICAS GERAIS DO BANCO:');
  console.log('-'.repeat(45));

  const { count: totalReviews, error: error1 } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('location_id', 'cartorio-paulista-location');

  const { count: reviewsWithComments, error: error2 } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('location_id', 'cartorio-paulista-location')
    .not('comment', 'is', null)
    .neq('comment', '');

  const { count: reviewsWithoutComments, error: error3 } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('location_id', 'cartorio-paulista-location')
    .or('comment.is.null,comment.eq.');

  if (error1 || error2 || error3) {
    console.error('❌ Erro nas consultas:', error1 || error2 || error3);
    return;
  }

  const commentRate = totalReviews > 0 ? ((reviewsWithComments / totalReviews) * 100).toFixed(1) : 0;
  const noCommentRate = totalReviews > 0 ? ((reviewsWithoutComments / totalReviews) * 100).toFixed(1) : 0;

  console.log(`Total de reviews no banco: ${totalReviews}`);
  console.log(`Reviews com comentários: ${reviewsWithComments} (${commentRate}%)`);
  console.log(`Reviews sem comentários: ${reviewsWithoutComments} (${noCommentRate}%)`);

  // 2. Análise detalhada de uma amostra maior
  console.log('\n📈 2. ANÁLISE DETALHADA DE AMOSTRA:');
  console.log('-'.repeat(40));

  const sampleSize = Math.min(2000, totalReviews);
  const { data: sampleReviews, error: error4 } = await supabase
    .from('reviews')
    .select('review_id, reviewer_name, comment, rating, create_time')
    .eq('location_id', 'cartorio-paulista-location')
    .order('create_time', { ascending: false })
    .limit(sampleSize);

  if (error4) {
    console.error('❌ Erro na amostra:', error4);
    return;
  }

  // Análise da amostra
  const analysis = {
    total: sampleReviews.length,
    withComments: 0,
    withoutComments: 0,
    validNames: 0,
    validDates: 0,
    commentLengths: [],
    ratings: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  };

  sampleReviews.forEach(review => {
    // Comentários
    const hasComment = review.comment && review.comment.trim() !== '';
    if (hasComment) {
      analysis.withComments++;
      analysis.commentLengths.push(review.comment.length);
    } else {
      analysis.withoutComments++;
    }

    // Nomes válidos
    if (review.reviewer_name && review.reviewer_name.trim() !== '' && review.reviewer_name !== 'Anonymous') {
      analysis.validNames++;
    }

    // Datas válidas
    if (review.create_time) {
      analysis.validDates++;
    }

    // Ratings
    if (review.rating >= 1 && review.rating <= 5) {
      analysis.ratings[review.rating]++;
    }
  });

  console.log(`Amostra analisada: ${analysis.total} reviews`);
  console.log(`Com comentários: ${analysis.withComments} (${((analysis.withComments / analysis.total) * 100).toFixed(1)}%)`);
  console.log(`Sem comentários: ${analysis.withoutComments} (${((analysis.withoutComments / analysis.total) * 100).toFixed(1)}%)`);
  console.log(`Nomes válidos: ${analysis.validNames} (${((analysis.validNames / analysis.total) * 100).toFixed(1)}%)`);
  console.log(`Datas válidas: ${analysis.validDates} (${((analysis.validDates / analysis.total) * 100).toFixed(1)}%)`);

  // Estatísticas dos comentários
  if (analysis.commentLengths.length > 0) {
    const avgLength = Math.round(analysis.commentLengths.reduce((a, b) => a + b, 0) / analysis.commentLengths.length);
    const minLength = Math.min(...analysis.commentLengths);
    const maxLength = Math.max(...analysis.commentLengths);

    console.log(`Tamanho médio dos comentários: ${avgLength} caracteres`);
    console.log(`Menor comentário: ${minLength} caracteres`);
    console.log(`Maior comentário: ${maxLength} caracteres`);
  }

  // 3. Distribuição de ratings
  console.log('\n⭐ 3. DISTRIBUIÇÃO DE RATINGS:');
  console.log('-'.repeat(30));
  for (let rating = 5; rating >= 1; rating--) {
    const count = analysis.ratings[rating];
    const percentage = analysis.total > 0 ? ((count / analysis.total) * 100).toFixed(1) : 0;
    console.log(`${rating} estrelas: ${count} (${percentage}%)`);
  }

  // 4. Exemplos de comentários por categoria
  console.log('\n💬 4. EXEMPLOS DE COMENTÁRIOS:');
  console.log('-'.repeat(35));

  const commentsByLength = sampleReviews
    .filter(r => r.comment && r.comment.trim() !== '')
    .sort((a, b) => b.comment.length - a.comment.length);

  console.log('📏 MAIS LONGOS:');
  commentsByLength.slice(0, 2).forEach((review, i) => {
    console.log(`${i + 1}. ${review.reviewer_name}: "${review.comment.substring(0, 150)}${review.comment.length > 150 ? '...' : ''}"`);
    console.log(`   (${review.comment.length} chars, ${review.rating}⭐)`);
  });

  console.log('\n📏 MAIS CURTOS:');
  const shortComments = sampleReviews
    .filter(r => r.comment && r.comment.trim() !== '' && r.comment.length <= 20)
    .slice(0, 3);

  shortComments.forEach((review, i) => {
    console.log(`${i + 1}. ${review.reviewer_name}: "${review.comment}" (${review.comment.length} chars, ${review.rating}⭐)`);
  });

  // 5. Análise de qualidade
  console.log('\n🔍 5. ANÁLISE DE QUALIDADE:');
  console.log('-'.repeat(30));

  const qualityScore = (analysis.withComments / analysis.total) * 100;
  const nameQuality = (analysis.validNames / analysis.total) * 100;
  const dateQuality = (analysis.validDates / analysis.total) * 100;

  console.log(`Pontuação geral: ${qualityScore.toFixed(1)}/100`);
  console.log(`Qualidade dos nomes: ${nameQuality.toFixed(1)}/100`);
  console.log(`Qualidade das datas: ${dateQuality.toFixed(1)}/100`);

  // Classificação de qualidade
  let qualityLevel = 'CRÍTICA';
  if (qualityScore >= 90 && nameQuality >= 95 && dateQuality >= 95) qualityLevel = 'EXCELENTE';
  else if (qualityScore >= 75 && nameQuality >= 90 && dateQuality >= 90) qualityLevel = 'MUITO BOA';
  else if (qualityScore >= 60 && nameQuality >= 80 && dateQuality >= 80) qualityLevel = 'BOA';
  else if (qualityScore >= 40) qualityLevel = 'RAZOÁVEL';
  else qualityLevel = 'PREOCUPANTE';

  console.log(`Classificação: ${qualityLevel}`);

  // 6. Insights e recomendações
  console.log('\n💡 6. INSIGHTS E RECOMENDAÇÕES:');
  console.log('-'.repeat(35));

  if (analysis.withoutComments > analysis.withComments) {
    console.log('⚠️ MAIORIA das reviews NÃO têm comentários');
    console.log('   • Pode indicar limitações da fonte de dados');
    console.log('   • Considerar fonte alternativa para comentários');
  }

  if (analysis.commentLengths.length > 0 && Math.max(...analysis.commentLengths) < 100) {
    console.log('ℹ️ Comentários tendem a ser CURTOS');
    console.log('   • Média de apenas alguns palavras');
    console.log('   • Pode refletir comportamento dos usuários no Google');
  }

  if (analysis.ratings[5] === analysis.total) {
    console.log('⭐ TODAS as reviews têm 5 ESTRELAS');
    console.log('   • Pode indicar viés de seleção');
    console.log('   • Verificar se o filtro está funcionando corretamente');
  }

  if (qualityLevel === 'EXCELENTE' || qualityLevel === 'MUITO BOA') {
    console.log('✅ SISTEMA FUNCIONANDO BEM');
    console.log('   • Dados consistentes e completos');
    console.log('   • Pronto para uso em produção');
  }

  console.log('\n🏁 ANÁLISE CONCLUÍDA');
  console.log('='.repeat(80));
}

finalComprehensiveAnalysis().catch(console.error);
