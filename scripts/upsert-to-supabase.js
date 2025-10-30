require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Usar service role key para ter permissões completas

if (!supabaseUrl || !supabaseKey) {
  console.error('Erro: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar definidos no arquivo .env');
  process.exit(1);
}

console.log('Conectando ao Supabase...');
console.log(`URL: ${supabaseUrl}`);
console.log(`Key: ${supabaseKey.substring(0, 20)}...`);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Lê o arquivo limpo
const inputFile = path.join(__dirname, '..', 'dataset_cleaned_2025-10-30.json');
console.log('Lendo arquivo limpo...');
const reviews = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

console.log(`Total de reviews a serem inseridas: ${reviews.length}\n`);

// Função para garantir que a localização existe
async function ensureLocation(locationInfo) {
  const { place_id, title, address, city, state, postal_code, country_code, cid } = locationInfo;

  // Verifica se já existe
  const { data: existing, error: selectError } = await supabase
    .from('gbp_locations')
    .select('location_id')
    .eq('place_id', place_id)
    .single();

  if (existing) {
    console.log(`Localização já existe: ${existing.location_id}`);
    return existing.location_id;
  }

  // Se não existe, cria uma nova
  const location_id = `loc_${place_id}`;
  const { data, error } = await supabase
    .from('gbp_locations')
    .upsert({
      location_id,
      account_id: 'cartorio-paulista', // Account ID do cartório
      name: 'Cartório Paulista',
      title,
      place_id,
      cid,
      address,
      phone: null, // Não temos no scrape
      website: null, // Não temos no scrape
      domain: null
    }, {
      onConflict: 'place_id'
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar localização:', error);
    throw error;
  }

  console.log(`Localização criada: ${location_id}`);
  return location_id;
}

// Função para fazer upsert em lotes
async function upsertReviewsBatch(reviewsBatch, locationId) {
  // Prepara os dados para a tabela reviews
  const reviewsData = reviewsBatch.map(r => ({
    review_id: r.review_id,
    location_id: locationId,
    rating: r.rating,
    comment: r.comment,
    reviewer_name: r.reviewer_name,
    is_anonymous: r.is_anonymous,
    create_time: r.create_time,
    update_time: r.update_time,
    reply_text: r.reply_text,
    reply_time: r.reply_time
  }));

  // Prepara os dados para a tabela reviews_raw
  const reviewsRawData = reviewsBatch.map(r => ({
    review_id: r.review_id,
    location_id: locationId,
    payload: r.raw_payload,
    received_at: new Date().toISOString()
  }));

  // Upsert na tabela reviews
  const { data: reviewsResult, error: reviewsError } = await supabase
    .from('reviews')
    .upsert(reviewsData, {
      onConflict: 'review_id',
      ignoreDuplicates: false
    });

  if (reviewsError) {
    console.error('Erro ao fazer upsert de reviews:', reviewsError);
    throw reviewsError;
  }

  // Upsert na tabela reviews_raw
  const { data: rawResult, error: rawError } = await supabase
    .from('reviews_raw')
    .upsert(reviewsRawData, {
      onConflict: 'review_id',
      ignoreDuplicates: false
    });

  if (rawError) {
    console.error('Erro ao fazer upsert de reviews_raw:', rawError);
    throw rawError;
  }

  return reviewsData.length;
}

// Função principal
async function main() {
  try {
    // Teste de conexão
    console.log('=== TESTE DE CONEXÃO ===');
    const { data: testData, error: testError } = await supabase
      .from('gbp_locations')
      .select('location_id')
      .limit(1);

    if (testError) {
      console.error('Erro ao testar conexão:', testError);
      throw new Error('Falha ao conectar ao Supabase. Verifique as credenciais.');
    }

    console.log('✓ Conexão com Supabase estabelecida com sucesso!\n');

    // Passo 1: Garantir que a localização existe
    console.log('=== PASSO 1: Verificando/Criando Localização ===');
    const firstReview = reviews[0];
    const locationId = await ensureLocation(firstReview.location_info);
    console.log(`Location ID a ser usado: ${locationId}\n`);

    // Passo 2: Fazer upsert das reviews em lotes
    console.log('=== PASSO 2: Inserindo Reviews ===');
    const batchSize = 100; // Processar 100 reviews por vez
    let totalInserted = 0;
    let totalErrors = 0;

    for (let i = 0; i < reviews.length; i += batchSize) {
      const batch = reviews.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(reviews.length / batchSize);

      try {
        const inserted = await upsertReviewsBatch(batch, locationId);
        totalInserted += inserted;
        console.log(`Lote ${batchNumber}/${totalBatches}: ${inserted} reviews inseridas (${totalInserted}/${reviews.length})`);
      } catch (error) {
        totalErrors += batch.length;
        console.error(`Erro no lote ${batchNumber}:`, error.message);
      }
    }

    // Resumo final
    console.log('\n=== RESUMO ===');
    console.log(`Total de reviews processadas: ${reviews.length}`);
    console.log(`Reviews inseridas com sucesso: ${totalInserted}`);
    console.log(`Erros: ${totalErrors}`);

    // Passo 3: Verificar o resultado no banco
    console.log('\n=== PASSO 3: Verificando Resultado ===');
    const { data: stats, error: statsError } = await supabase
      .from('reviews')
      .select('rating')
      .eq('location_id', locationId);

    if (statsError) {
      console.error('Erro ao buscar estatísticas:', statsError);
    } else {
      console.log(`Total de reviews no banco para esta localização: ${stats.length}`);

      const ratingDistribution = stats.reduce((acc, r) => {
        acc[r.rating] = (acc[r.rating] || 0) + 1;
        return acc;
      }, {});

      console.log('Distribuição de ratings no banco:');
      for (let i = 5; i >= 1; i--) {
        console.log(`  ${i} estrelas: ${ratingDistribution[i] || 0}`);
      }
    }

    console.log('\n✓ Processo concluído com sucesso!');
  } catch (error) {
    console.error('\n✗ Erro durante o processo:', error);
    process.exit(1);
  }
}

// Executa
main();
