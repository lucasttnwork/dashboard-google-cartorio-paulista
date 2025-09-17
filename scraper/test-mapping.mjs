import fs from 'fs';

// Testar o mapeamento corrigido
function testCorrectedMapping() {
  const raw = fs.readFileSync('results.json', 'utf8');
  const obj = JSON.parse(raw);
  const reviews = obj.user_reviews_extended;

  console.log('=== TESTE DO MAPEAMENTO CORRIGIDO ===');

  // Importar a função mapReview corrigida
  function cleanText(text) {
    if (!text || typeof text !== 'string') return ''
    return text.trim().replace(/\s+/g, ' ').substring(0, 2000)
  }

  function mapReview(r) {
    const rating = Number(
      r?.rating ?? r?.rating_value ?? r?.stars ?? r?.score ?? (r?.rating?.value)
    ) || 5
    const comment = cleanText(r?.Description ?? r?.text ?? r?.review_text ?? r?.body ?? r?.comment ?? '')
    const reviewer_name = cleanText(r?.Name ?? r?.author_name ?? r?.author ?? r?.user ?? r?.name ?? 'Anonymous')

    return {
      rating,
      comment,
      reviewer_name,
      hasComment: !!(comment && comment.trim()),
      commentLength: comment ? comment.length : 0
    }
  }

  // Testar com as primeiras 5 reviews
  console.log('Testando mapeamento das primeiras 5 reviews:');
  for (let i = 0; i < Math.min(5, reviews.length); i++) {
    const review = reviews[i];
    const mapped = mapReview(review);

    console.log(`${i + 1}. ${mapped.reviewer_name} (Rating: ${mapped.rating})`);
    console.log(`   Tem comentário: ${mapped.hasComment}`);
    console.log(`   Comprimento: ${mapped.commentLength} chars`);
    if (mapped.hasComment) {
      console.log(`   Preview: "${mapped.comment.substring(0, 80)}..."`);
    }
    console.log('---');
  }

  // Estatísticas gerais
  const stats = reviews.slice(0, 100).map(mapReview).reduce((acc, r) => {
    acc.total++;
    if (r.hasComment) acc.withComments++;
    else acc.withoutComments++;
    return acc;
  }, { total: 0, withComments: 0, withoutComments: 0 });

  console.log('Estatísticas (primeiras 100 reviews):');
  console.log(`- Total: ${stats.total}`);
  console.log(`- Com comentários: ${stats.withComments}`);
  console.log(`- Sem comentários: ${stats.withoutComments}`);
  console.log(`- Taxa de comentários: ${((stats.withComments / stats.total) * 100).toFixed(1)}%`);
}

testCorrectedMapping();


