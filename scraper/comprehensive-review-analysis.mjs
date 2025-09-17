import { createClient } from '@supabase/supabase-js';
import { config } from './config/config.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey || config.supabase.anonKey);

async function comprehensiveReviewAnalysis() {
  console.log('🔍 ANÁLISE COMPREENSIVA DE REVIEWS - AMOSTRA DE 1000+ REVIEWS');
  console.log('=' .repeat(70));

  // Buscar 1500 reviews para ter uma margem (garantir pelo menos 1000 válidas)
  console.log('📊 Buscando amostra de reviews...');
  const { data: sampleReviews, error } = await supabase
    .from('reviews')
    .select('review_id, reviewer_name, comment, rating, create_time, update_time')
    .eq('location_id', 'cartorio-paulista-location')
    .order('create_time', { ascending: false })
    .limit(1500);

  if (error) {
    console.error('❌ Erro ao buscar reviews:', error);
    return;
  }

  console.log(`✅ Encontradas ${sampleReviews.length} reviews para análise\n`);

  // Análise detalhada
  let stats = {
    total: sampleReviews.length,
    withComments: 0,
    withoutComments: 0,
    withNames: 0,
    withoutNames: 0,
    withDates: 0,
    withoutDates: 0,
    complete: 0, // tem comentário, nome E data
    averageCommentLength: 0,
    totalCommentLength: 0,
    ratings: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  };

  // Arrays para exemplos
  const examples = {
    withComments: [],
    withoutComments: [],
    complete: [],
    incomplete: []
  };

  sampleReviews.forEach((review, index) => {
    // Verificar comentários
    const hasComment = review.comment && review.comment.trim() !== '';
    if (hasComment) {
      stats.withComments++;
      stats.totalCommentLength += review.comment.length;
      if (examples.withComments.length < 5) {
        examples.withComments.push(review);
      }
    } else {
      stats.withoutComments++;
      if (examples.withoutComments.length < 5) {
        examples.withoutComments.push(review);
      }
    }

    // Verificar nome
    const hasName = review.reviewer_name && review.reviewer_name.trim() !== '' && review.reviewer_name !== 'Anonymous';
    if (hasName) stats.withNames++;
    else stats.withoutNames++;

    // Verificar data
    const hasDate = review.create_time && review.create_time !== '';
    if (hasDate) stats.withDates++;
    else stats.withoutDates++;

    // Reviews completas (comentário + nome + data)
    const isComplete = hasComment && hasName && hasDate;
    if (isComplete) {
      stats.complete++;
      if (examples.complete.length < 5) {
        examples.complete.push(review);
      }
    } else {
      if (examples.incomplete.length < 5) {
        examples.incomplete.push(review);
      }
    }

    // Contar ratings
    if (review.rating >= 1 && review.rating <= 5) {
      stats.ratings[review.rating]++;
    }
  });

  // Calcular média do tamanho dos comentários
  stats.averageCommentLength = stats.withComments > 0 ?
    Math.round(stats.totalCommentLength / stats.withComments) : 0;

  // RESULTADOS PRINCIPAIS
  console.log('📈 RESULTADOS PRINCIPAIS:');
  console.log('-'.repeat(50));
  console.log(`Total de reviews analisadas: ${stats.total}`);
  console.log(`Com comentários: ${stats.withComments} (${((stats.withComments / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Sem comentários: ${stats.withoutComments} (${((stats.withoutComments / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Com nomes válidos: ${stats.withNames} (${((stats.withNames / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Com datas: ${stats.withDates} (${((stats.withDates / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Reviews completas: ${stats.complete} (${((stats.complete / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Tamanho médio dos comentários: ${stats.averageCommentLength} caracteres`);
  console.log();

  // DISTRIBUIÇÃO DE RATINGS
  console.log('⭐ DISTRIBUIÇÃO DE RATINGS:');
  console.log('-'.repeat(30));
  for (let rating = 5; rating >= 1; rating--) {
    const count = stats.ratings[rating];
    const percentage = ((count / stats.total) * 100).toFixed(1);
    console.log(`${rating} estrelas: ${count} reviews (${percentage}%)`);
  }
  console.log();

  // EXEMPLOS DE REVIEWS COM COMENTÁRIOS
  console.log('💬 EXEMPLOS DE REVIEWS COM COMENTÁRIOS:');
  console.log('='.repeat(50));
  examples.withComments.forEach((review, index) => {
    console.log(`${index + 1}. ${review.reviewer_name} (${review.rating}⭐)`);
    console.log(`   📅 ${new Date(review.create_time).toLocaleDateString('pt-BR')}`);
    console.log(`   💬 "${review.comment.substring(0, 120)}${review.comment.length > 120 ? '...' : ''}"`);
    console.log(`   📏 ${review.comment.length} caracteres`);
    console.log('---');
  });
  console.log();

  // EXEMPLOS DE REVIEWS SEM COMENTÁRIOS
  console.log('❌ EXEMPLOS DE REVIEWS SEM COMENTÁRIOS:');
  console.log('='.repeat(50));
  examples.withoutComments.slice(0, 3).forEach((review, index) => {
    console.log(`${index + 1}. ${review.reviewer_name || 'Nome não informado'} (${review.rating}⭐)`);
    console.log(`   📅 ${review.create_time ? new Date(review.create_time).toLocaleDateString('pt-BR') : 'Data não informada'}`);
    console.log(`   💬 Comentário vazio`);
    console.log('---');
  });
  console.log();

  // ANÁLISE DE QUALIDADE DOS DADOS
  console.log('🔍 ANÁLISE DE QUALIDADE DOS DADOS:');
  console.log('='.repeat(50));

  const qualityScore = (stats.complete / stats.total) * 100;
  console.log(`Pontuação de qualidade: ${qualityScore.toFixed(1)}/100`);

  if (qualityScore >= 90) {
    console.log('✅ QUALIDADE EXCELENTE - Sistema funcionando perfeitamente');
  } else if (qualityScore >= 75) {
    console.log('✅ QUALIDADE BOA - Sistema funcionando bem');
  } else if (qualityScore >= 60) {
    console.log('⚠️ QUALIDADE RAZOÁVEL - Pode ser melhorado');
  } else {
    console.log('❌ QUALIDADE PREOCUPANTE - Necessita atenção');
  }

  console.log();

  // RECOMENDAÇÕES
  console.log('💡 RECOMENDAÇÕES:');
  console.log('-'.repeat(20));

  if (stats.withoutComments > 0) {
    console.log(`• ${stats.withoutComments} reviews sem comentários - verificar se são reviews apenas com rating`);
  }

  if (stats.withoutNames > 0) {
    console.log(`• ${stats.withoutNames} reviews sem nome válido - verificar mapeamento de campos`);
  }

  if (stats.withoutDates > 0) {
    console.log(`• ${stats.withoutDates} reviews sem data - verificar captura de timestamps`);
  }

  if (stats.complete === stats.total) {
    console.log('• 🎉 Todas as reviews têm dados completos - sistema funcionando perfeitamente!');
  }

  console.log();
  console.log('🏁 ANÁLISE CONCLUÍDA');
  console.log('='.repeat(70));
}

comprehensiveReviewAnalysis().catch(console.error);
