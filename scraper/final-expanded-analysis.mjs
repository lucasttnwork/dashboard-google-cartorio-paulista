import { createClient } from '@supabase/supabase-js';
import { config } from './config/config.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey || config.supabase.anonKey);

async function finalExpandedAnalysis() {
  console.log('🎯 ANÁLISE FINAL - BASE EXPANDIDA DE REVIEWS');
  console.log('=' .repeat(80));

  // 1. Estatísticas gerais da base expandida
  console.log('📊 1. ESTATÍSTICAS GERAIS DA BASE EXPANDIDA:');
  console.log('-'.repeat(50));

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

  if (error1 || error2) {
    console.error('❌ Erro:', error1 || error2);
    return;
  }

  const commentRate = totalReviews > 0 ? ((reviewsWithComments / totalReviews) * 100).toFixed(1) : 0;

  console.log(`Total de reviews na base: ${totalReviews}`);
  console.log(`Reviews com comentários: ${reviewsWithComments} (${commentRate}%)`);
  console.log(`Reviews sem comentários: ${totalReviews - reviewsWithComments}`);
  console.log(`Progresso em direção a 8.000: ${((totalReviews / 8000) * 100).toFixed(1)}%`);

  // 2. Análise de distribuição de ratings APÓS EXPANSÃO
  console.log('\n⭐ 2. DISTRIBUIÇÃO DE RATINGS APÓS EXPANSÃO:');
  console.log('-'.repeat(45));

  const { data: ratingData, error: error3 } = await supabase
    .from('reviews')
    .select('rating')
    .eq('location_id', 'cartorio-paulista-location');

  if (error3) {
    console.error('❌ Erro:', error3);
    return;
  }

  const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratingData.forEach(review => {
    const rating = review.rating;
    if (rating >= 1 && rating <= 5) {
      ratingCounts[rating]++;
    }
  });

  let hasVariety = false;
  for (let rating = 1; rating <= 4; rating++) {
    if (ratingCounts[rating] > 0) {
      hasVariety = true;
      break;
    }
  }

  console.log('DISTRIBUIÇÃO DETALHADA:');
  for (let rating = 5; rating >= 1; rating--) {
    const count = ratingCounts[rating];
    const percentage = ((count / totalReviews) * 100).toFixed(1);
    const status = rating === 5 && count === totalReviews ? '🚨 VIÉS GRAVE' :
                   rating < 5 && count > 0 ? '✅ VARIABILIDADE' : '❌ AUSENTE';
    console.log(`${rating} estrelas: ${count} reviews (${percentage}%) ${status}`);
  }

  // 3. Análise temporal expandida
  console.log('\n📅 3. ANÁLISE TEMPORAL EXPANDIDA:');
  console.log('-'.repeat(35));

  const { data: timeData, error: error4 } = await supabase
    .from('reviews')
    .select('create_time')
    .eq('location_id', 'cartorio-paulista-location')
    .order('create_time', { ascending: false });

  if (error4) {
    console.error('❌ Erro:', error4);
    return;
  }

  const dates = {};
  timeData.forEach(review => {
    if (review.create_time) {
      const date = new Date(review.create_time).toISOString().split('T')[0];
      dates[date] = (dates[date] || 0) + 1;
    }
  });

  console.log('Reviews por data de importação:');
  Object.keys(dates).sort().reverse().forEach(date => {
    console.log(`   ${date}: ${dates[date]} reviews`);
  });

  const uniqueDates = Object.keys(dates).length;
  console.log(`Total de datas diferentes: ${uniqueDates}`);

  if (uniqueDates > 1) {
    console.log('✅ Dados de múltiplas coletas - boa diversidade temporal');
  } else {
    console.log('⚠️ Todos os dados de uma única data - falta diversidade temporal');
  }

  // 4. Análise de conteúdo expandida
  console.log('\n💬 4. ANÁLISE DE CONTEÚDO EXPANDIDA:');
  console.log('-'.repeat(40));

  const { data: commentData, error: error5 } = await supabase
    .from('reviews')
    .select('comment, reviewer_name, rating')
    .eq('location_id', 'cartorio-paulista-location')
    .not('comment', 'is', null)
    .neq('comment', '')
    .limit(2000);

  if (error5) {
    console.error('❌ Erro:', error5);
    return;
  }

  // Análise de padrões de comentários
  const commentAnalysis = {
    veryShort: commentData.filter(r => r.comment.length <= 10),
    short: commentData.filter(r => r.comment.length > 10 && r.comment.length <= 50),
    medium: commentData.filter(r => r.comment.length > 50 && r.comment.length <= 200),
    long: commentData.filter(r => r.comment.length > 200)
  };

  console.log('Distribuição por tamanho de comentário:');
  console.log(`   Muito curtos (≤10 chars): ${commentAnalysis.veryShort.length}`);
  console.log(`   Curtos (11-50 chars): ${commentAnalysis.short.length}`);
  console.log(`   Médios (51-200 chars): ${commentAnalysis.medium.length}`);
  console.log(`   Longos (>200 chars): ${commentAnalysis.long.length}`);

  // Exemplos de comentários por categoria
  console.log('\nExemplos de comentários:');
  console.log('📏 MAIS CURTOS:');
  commentAnalysis.veryShort.slice(0, 3).forEach((review, i) => {
    console.log(`   "${review.comment}" (${review.comment.length} chars)`);
  });

  console.log('📏 MAIS LONGOS:');
  const longComments = commentData
    .filter(r => r.comment.length > 100)
    .sort((a, b) => b.comment.length - a.comment.length)
    .slice(0, 2);

  longComments.forEach((review, i) => {
    console.log(`   "${review.comment.substring(0, 120)}..." (${review.comment.length} chars)`);
  });

  // 5. Análise de qualidade e viés
  console.log('\n🔍 5. ANÁLISE DE QUALIDADE E VIÉS:');
  console.log('-'.repeat(35));

  const qualityMetrics = {
    hasComments: parseFloat(commentRate),
    hasRatingVariety: hasVariety,
    hasTemporalDiversity: uniqueDates > 1,
    totalReviews: totalReviews
  };

  console.log('Métricas de qualidade:');
  console.log(`   • Taxa de comentários: ${qualityMetrics.hasComments}%`);
  console.log(`   • Variedade de ratings: ${qualityMetrics.hasRatingVariety ? 'SIM' : 'NÃO'}`);
  console.log(`   • Diversidade temporal: ${qualityMetrics.hasTemporalDiversity ? 'SIM' : 'NÃO'}`);
  console.log(`   • Volume total: ${qualityMetrics.totalReviews} reviews`);

  // Classificação final
  let overallQuality = 'CRÍTICA';
  if (qualityMetrics.hasComments >= 80 && qualityMetrics.hasRatingVariety && qualityMetrics.hasTemporalDiversity) {
    overallQuality = 'EXCELENTE';
  } else if (qualityMetrics.hasComments >= 60 && (qualityMetrics.hasRatingVariety || qualityMetrics.hasTemporalDiversity)) {
    overallQuality = 'BOA';
  } else if (qualityMetrics.hasComments >= 40) {
    overallQuality = 'REGULAR';
  }

  console.log(`\n🏆 CLASSIFICAÇÃO GERAL: ${overallQuality}`);

  // 6. Diagnóstico de viés
  console.log('\n🚨 6. DIAGNÓSTICO DE VIÉS:');
  console.log('-'.repeat(25));

  const biasIssues = [];

  if (ratingCounts[5] === totalReviews) {
    biasIssues.push('❌ VIÉS CRÍTICO: 100% das reviews têm 5 estrelas');
  }

  if (!hasVariety) {
    biasIssues.push('❌ VIÉS DE SELEÇÃO: Não há variedade de ratings');
  }

  if (uniqueDates === 1) {
    biasIssues.push('⚠️ VIÉS TEMPORAL: Dados de apenas uma data');
  }

  if (commentAnalysis.veryShort.length > commentAnalysis.medium.length + commentAnalysis.long.length) {
    biasIssues.push('⚠️ VIÉS DE CONTEÚDO: Predominância de comentários muito curtos');
  }

  if (biasIssues.length === 0) {
    console.log('✅ NENHUM VIÉS CRÍTICO DETECTADO');
    console.log('   • Dados parecem representativos');
    console.log('   • Boa distribuição de qualidade');
  } else {
    console.log('PROBLEMAS DE VIÉS IDENTIFICADOS:');
    biasIssues.forEach(issue => console.log(`   ${issue}`));
  }

  // 7. Recomendações finais
  console.log('\n💡 7. RECOMENDAÇÕES PARA MELHORAR FIDEDIGNIDADE:');
  console.log('-'.repeat(55));

  if (ratingCounts[5] === totalReviews) {
    console.log('🔧 PRIORIDADE 1 - CORREÇÃO IMEDIATA:');
    console.log('   • Investigar configuração do scraper Google Maps');
    console.log('   • Verificar se há filtros limitando ratings');
    console.log('   • Testar scraper com outros estabelecimentos');
    console.log('   • Comparar com dados oficiais do Google My Business');
  }

  if (!hasVariety) {
    console.log('🔧 PRIORIDADE 2 - VARIABILIDADE:');
    console.log('   • Implementar coleta de ratings variados');
    console.log('   • Verificar se Google Maps oculta reviews negativas');
    console.log('   • Considerar APIs alternativas (Google Places API)');
  }

  if (uniqueDates === 1) {
    console.log('🔧 PRIORIDADE 3 - DIVERSIDADE TEMPORAL:');
    console.log('   • Agendar coletas periódicas');
    console.log('   • Implementar sistema de monitoramento contínuo');
    console.log('   • Coletar dados históricos quando possível');
  }

  console.log('\n📈 PRÓXIMOS PASSOS RECOMENDADOS:');
  console.log('-'.repeat(35));
  console.log('1. 🔍 Investigar causa do viés de 5 estrelas');
  console.log('2. 🧪 Testar scraper com outros estabelecimentos');
  console.log('3. 📊 Implementar métricas de qualidade de dados');
  console.log('4. 📅 Configurar coletas automatizadas');
  console.log('5. 🎯 Comparar com dados reais do Google My Business');

  console.log('\n🏁 ANÁLISE FINAL CONCLUÍDA');
  console.log('='.repeat(80));

  // Resumo executivo
  console.log('\n📋 RESUMO EXECUTIVO:');
  console.log('-'.repeat(20));
  console.log(`• Volume atual: ${totalReviews} reviews (${((totalReviews / 8000) * 100).toFixed(1)}% da meta)`);
  console.log(`• Qualidade geral: ${overallQuality}`);
  console.log(`• Viés crítico detectado: ${biasIssues.length > 0 ? 'SIM' : 'NÃO'}`);
  console.log(`• Pronto para produção: ${overallQuality === 'EXCELENTE' ? 'SIM' : 'NÃO'}`);
}

finalExpandedAnalysis().catch(console.error);
