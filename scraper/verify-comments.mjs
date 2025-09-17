import { createClient } from '@supabase/supabase-js';
import { config } from './config/config.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey || config.supabase.anonKey);

// Verificar se os comentários estão sendo salvos agora
async function checkCommentsAfterImport() {
  console.log('=== VERIFICAÇÃO APÓS IMPORTAÇÃO CORRIGIDA ===');

  // Pegar algumas reviews recentes (das que acabaram de ser importadas)
  const { data: recentReviews, error } = await supabase
    .from('reviews')
    .select('review_id, reviewer_name, comment, rating, create_time')
    .eq('location_id', 'cartorio-paulista-location')
    .order('create_time', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Erro:', error);
    return;
  }

  console.log('Verificando as 10 reviews mais recentes:');

  let withComments = 0;
  let withoutComments = 0;

  recentReviews.forEach((review, index) => {
    const hasComment = review.comment && review.comment.trim() !== '';

    console.log(`${index + 1}. ${review.reviewer_name} (Rating: ${review.rating})`);

    if (hasComment) {
      withComments++;
      console.log(`   ✅ TEM comentário (${review.comment.length} chars)`);
      console.log(`   Preview: "${review.comment.substring(0, 100)}..."`);
    } else {
      withoutComments++;
      console.log(`   ❌ SEM comentário`);
    }
    console.log('---');
  });

  console.log('Resumo das 10 reviews mais recentes:');
  console.log(`- Com comentários: ${withComments}`);
  console.log(`- Sem comentários: ${withoutComments}`);
  console.log(`- Taxa: ${((withComments / (withComments + withoutComments)) * 100).toFixed(1)}%`);

  // Estatísticas gerais
  const { count: totalCount } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('location_id', 'cartorio-paulista-location');

  console.log(`\nTotal de reviews no banco: ${totalCount}`);

  // Verificar se há alguma review antiga sem comentário
  const { data: oldReviews } = await supabase
    .from('reviews')
    .select('comment')
    .eq('location_id', 'cartorio-paulista-location')
    .is('comment', null)
    .limit(5);

  console.log(`\nReviews antigas sem comentários encontrados: ${oldReviews?.length || 0}`);

  // Agora buscar reviews que têm comentários
  console.log('\n=== BUSCANDO REVIEWS COM COMENTÁRIOS ===');

  const { data: reviewsWithComments, error: error2 } = await supabase
    .from('reviews')
    .select('review_id, reviewer_name, comment, rating, create_time')
    .eq('location_id', 'cartorio-paulista-location')
    .not('comment', 'is', null)
    .neq('comment', '')
    .limit(5);

  if (error2) {
    console.error('Erro ao buscar reviews com comentários:', error2);
    return;
  }

  console.log(`Encontradas ${reviewsWithComments.length} reviews com comentários:`);

  reviewsWithComments.forEach((review, index) => {
    console.log(`${index + 1}. ${review.reviewer_name}`);
    console.log(`   Rating: ${review.rating}`);
    console.log(`   Comentário (${review.comment.length} chars): ${review.comment.substring(0, 100)}...`);
    console.log(`   Criado em: ${review.create_time}`);
    console.log('---');
  });

  // Estatísticas finais
  const { count: withCommentsCount } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('location_id', 'cartorio-paulista-location')
    .not('comment', 'is', null)
    .neq('comment', '');

  console.log(`\nEstatísticas finais:`);
  console.log(`- Total de reviews: ${totalCount}`);
  console.log(`- Com comentários: ${withCommentsCount}`);
  console.log(`- Taxa: ${totalCount > 0 ? ((withCommentsCount / totalCount) * 100).toFixed(1) : 0}%`);
}

checkCommentsAfterImport().catch(console.error);
