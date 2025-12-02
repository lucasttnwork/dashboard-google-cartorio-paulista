const fs = require('fs');
const path = require('path');

// Lê o arquivo JSON original
const inputFile = path.join(__dirname, '..', 'dataset_Google-Maps-Reviews-Scraper_2025-10-30_14-08-45-914.json');
const outputFile = path.join(__dirname, '..', 'dataset_cleaned_2025-10-30.json');

console.log('Lendo arquivo original...');
const rawData = fs.readFileSync(inputFile, 'utf-8');
const reviews = JSON.parse(rawData);

console.log(`Total de reviews encontrados: ${reviews.length}`);

// Função para limpar e normalizar os dados
function cleanReview(review) {
  return {
    // Identificadores
    review_id: review.reviewId,
    place_id: review.placeId,

    // Dados da review
    rating: review.stars,
    comment: review.text || null,
    reviewer_name: review.name || 'Anônimo',
    is_anonymous: !review.name || review.name === '',

    // Timestamps
    create_time: review.publishedAtDate,
    update_time: review.publishedAtDate, // Usar publishedAtDate como update_time se não houver outro

    // Resposta do proprietário
    reply_text: review.responseFromOwnerText || null,
    reply_time: review.responseFromOwnerDate || null,

    // Dados da localização (para referência)
    location_info: {
      place_id: review.placeId,
      title: review.title,
      address: review.address,
      city: review.city,
      state: review.state,
      postal_code: review.postalCode,
      country_code: review.countryCode,
      cid: review.cid,
      lat: review.location?.lat,
      lng: review.location?.lng,
      total_score: review.totalScore,
      reviews_count: review.reviewsCount
    },

    // Dados do revisor (para análise adicional)
    reviewer_info: {
      reviewer_id: review.reviewerId,
      reviewer_url: review.reviewerUrl,
      reviewer_photo_url: review.reviewerPhotoUrl,
      reviewer_number_of_reviews: review.reviewerNumberOfReviews,
      is_local_guide: review.isLocalGuide
    },

    // Metadados
    scraped_at: review.scrapedAt,
    review_url: review.reviewUrl,
    likes_count: review.likesCount,

    // Payload completo (para reviews_raw)
    raw_payload: review
  };
}

console.log('Processando e limpando reviews...');
const cleanedReviews = reviews.map(cleanReview);

// Estatísticas
const stats = {
  total_reviews: cleanedReviews.length,
  with_comment: cleanedReviews.filter(r => r.comment).length,
  without_comment: cleanedReviews.filter(r => !r.comment).length,
  with_reply: cleanedReviews.filter(r => r.reply_text).length,
  rating_distribution: {
    5: cleanedReviews.filter(r => r.rating === 5).length,
    4: cleanedReviews.filter(r => r.rating === 4).length,
    3: cleanedReviews.filter(r => r.rating === 3).length,
    2: cleanedReviews.filter(r => r.rating === 2).length,
    1: cleanedReviews.filter(r => r.rating === 1).length
  },
  unique_place_ids: [...new Set(cleanedReviews.map(r => r.place_id))],
  date_range: {
    oldest: new Date(Math.min(...cleanedReviews.map(r => new Date(r.create_time)))).toISOString(),
    newest: new Date(Math.max(...cleanedReviews.map(r => new Date(r.create_time)))).toISOString()
  }
};

console.log('\n=== ESTATÍSTICAS ===');
console.log(`Total de reviews: ${stats.total_reviews}`);
console.log(`Com comentário: ${stats.with_comment}`);
console.log(`Sem comentário: ${stats.without_comment}`);
console.log(`Com resposta do proprietário: ${stats.with_reply}`);
console.log('\nDistribuição de ratings:');
console.log(`  5 estrelas: ${stats.rating_distribution[5]}`);
console.log(`  4 estrelas: ${stats.rating_distribution[4]}`);
console.log(`  3 estrelas: ${stats.rating_distribution[3]}`);
console.log(`  2 estrelas: ${stats.rating_distribution[2]}`);
console.log(`  1 estrela: ${stats.rating_distribution[1]}`);
console.log(`\nPlace IDs únicos: ${stats.unique_place_ids.length}`);
stats.unique_place_ids.forEach(pid => console.log(`  - ${pid}`));
console.log(`\nPeríodo das reviews:`);
console.log(`  Mais antiga: ${stats.date_range.oldest}`);
console.log(`  Mais recente: ${stats.date_range.newest}`);

// Salva o arquivo limpo
console.log(`\nSalvando arquivo limpo em: ${outputFile}`);
fs.writeFileSync(outputFile, JSON.stringify(cleanedReviews, null, 2), 'utf-8');

console.log('\nArquivo limpo criado com sucesso!');
console.log(`Total de ${cleanedReviews.length} reviews prontas para inserção no Supabase.`);
