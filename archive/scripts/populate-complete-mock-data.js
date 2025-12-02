const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDM1NjAsImV4cCI6MjA3MTk3OTU2MH0.9qYGEjUf7fz4_KNAcvSZfaiYLlGZllSYxlvNhXmGGWU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CARTORIO = {
  place_id: 'ChIJPXbxB0ZYzpQR-6-w9dl9lSI',
  location_id: 'cartorio_paulista_main'
};

// TODOS os reviews (incluindo não relacionados ao E-notariado)
const ALL_MOCK_REVIEWS = [
  // Reviews relacionados ao E-notariado (com menção específica)
  {
    rating: 5,
    comment: "Excelente atendimento no setor de E-notariado! A Bianca Alves foi muito atenciosa e esclareceu todas as dúvidas sobre a assinatura digital. Super recomendo!",
    reviewer_name: "Maria Silva Santos",
    create_time: "2025-08-02T09:30:00Z"
  },
  {
    rating: 5,
    comment: "Precisei fazer um certificado digital e a Ana Sophia me ajudou perfeitamente. Explicou passo a passo todo o processo do E-notariado. Serviço impecável!",
    reviewer_name: "João Carlos Pereira",
    create_time: "2025-08-05T14:15:00Z"
  },
  {
    rating: 4,
    comment: "Atendimento rápido no setor digital. Fabiana Medeiros foi muito profissional e resolveu minha questão com o E-notariado rapidamente. Só demorou um pouco na fila.",
    reviewer_name: "Carla Regina Oliveira",
    create_time: "2025-08-08T11:45:00Z"
  },
  {
    rating: 5,
    comment: "João Silva do E-notariado me ajudou com a certificação digital. Muito eficiente e simpático. O cartório está de parabéns pela modernização!",
    reviewer_name: "Roberto Almeida Costa",
    create_time: "2025-08-12T16:20:00Z"
  },
  {
    rating: 5,
    comment: "Excelente experiência com o E-notariado! Karen Figueiredo me orientou perfeitamente sobre todos os procedimentos digitais. Atendimento nota 10!",
    reviewer_name: "Fernanda Lima Santos",
    create_time: "2025-08-15T10:00:00Z"
  },
  {
    rating: 4,
    comment: "Letícia Andreza do setor de E-notariado foi muito prestativa. Resolveu minha dúvida sobre assinatura digital rapidamente. Só poderia ser mais rápido ainda.",
    reviewer_name: "Paulo Roberto Silva",
    create_time: "2025-08-18T13:30:00Z"
  },
  {
    rating: 5,
    comment: "Kaio Gomes me ajudou com o certificado digital no E-notariado. Profissionalismo e eficiência! Superou minhas expectativas.",
    reviewer_name: "Ana Paula Rodrigues",
    create_time: "2025-08-22T15:45:00Z"
  },
  {
    rating: 5,
    comment: "Alan Lourenço do E-notariado foi excepcional! Explicou tudo sobre o processo digital e me deixou super segura para prosseguir. Obrigada!",
    reviewer_name: "Juliana Costa Martins",
    create_time: "2025-08-25T09:15:00Z"
  },
  {
    rating: 5,
    comment: "Robson Lopes me atendeu no setor de E-notariado. Muito competente e paciente. Resolveu todas as questões sobre certificação digital.",
    reviewer_name: "Marcos Vinicius Souza",
    create_time: "2025-08-28T14:00:00Z"
  },

  // Reviews sobre E-notariado sem menção específica de colaborador
  {
    rating: 5,
    comment: "Incrível o atendimento no E-notariado! Moderno e eficiente. Todas as dúvidas sobre assinatura digital foram esclarecidas.",
    reviewer_name: "Patricia Fernandes",
    create_time: "2025-08-03T11:20:00Z"
  },
  {
    rating: 5,
    comment: "Processo de certificação digital super simples e rápido no cartório. E-notariado funcionando perfeitamente!",
    reviewer_name: "Ricardo Santos Lima",
    create_time: "2025-08-07T16:30:00Z"
  },
  {
    rating: 4,
    comment: "Bom atendimento no setor digital. Explicaram bem sobre o E-notariado, mas teve uma pequena demora na fila.",
    reviewer_name: "Luciana Pereira Costa",
    create_time: "2025-08-10T10:45:00Z"
  },
  {
    rating: 5,
    comment: "Adorei o sistema de E-notariado! Tudo digital e muito prático. Atendimento excelente.",
    reviewer_name: "Bruno Henrique Silva",
    create_time: "2025-08-14T12:15:00Z"
  },
  {
    rating: 5,
    comment: "Equipe do E-notariado muito preparada. Explicaram detalhadamente sobre certificação digital. Recomendo!",
    reviewer_name: "Camila Santos Rocha",
    create_time: "2025-08-17T15:30:00Z"
  },
  {
    rating: 4,
    comment: "Serviço de E-notariado funcionando bem. Atendimento cordial, mas poderia ser um pouco mais rápido.",
    reviewer_name: "Diego Martins Silva",
    create_time: "2025-08-20T13:45:00Z"
  },
  {
    rating: 5,
    comment: "Excelente experiência com o E-notariado! Tudo muito organizado e digital. Parabéns pela modernização!",
    reviewer_name: "Amanda Costa Pereira",
    create_time: "2025-08-24T11:00:00Z"
  },
  {
    rating: 5,
    comment: "Atendimento impecável no setor de certificação digital. E-notariado super eficiente!",
    reviewer_name: "Felipe Rodrigues Lima",
    create_time: "2025-08-27T14:30:00Z"
  },

  // Reviews sobre outros serviços do cartório (NÃO relacionados ao E-notariado)
  {
    rating: 5,
    comment: "Excelente atendimento para registro de imóveis. Profissionais muito competentes e atendimento rápido.",
    reviewer_name: "Carlos Eduardo Silva",
    create_time: "2025-08-01T08:45:00Z"
  },
  {
    rating: 4,
    comment: "Fiz o reconhecimento de firma hoje. Processo tranquilo e equipe prestativa. Recomendo!",
    reviewer_name: "Ana Beatriz Costa",
    create_time: "2025-08-04T10:20:00Z"
  },
  {
    rating: 5,
    comment: "Registro de nascimento do meu filho foi super rápido. Atendimento humanizado e eficiente.",
    reviewer_name: "Roberto Santos",
    create_time: "2025-08-06T09:15:00Z"
  },
  {
    rating: 3,
    comment: "Vim fazer autenticação de documentos. Serviço ok, mas fila estava um pouco longa hoje.",
    reviewer_name: "Maria José Oliveira",
    create_time: "2025-08-09T13:00:00Z"
  },
  {
    rating: 5,
    comment: "Registro de casamento foi perfeito! Equipe muito profissional e ambiente acolhedor.",
    reviewer_name: "Fernando Pereira",
    create_time: "2025-08-11T15:30:00Z"
  },
  {
    rating: 4,
    comment: "Fiz averbação de divórcio. Processo bem explicado e atendimento cordial.",
    reviewer_name: "Cristina Lima",
    create_time: "2025-08-13T11:45:00Z"
  },
  {
    rating: 5,
    comment: "Registro de união estável foi muito bem atendido. Parabéns pela eficiência!",
    reviewer_name: "João Pedro Santos",
    create_time: "2025-08-16T14:20:00Z"
  },
  {
    rating: 4,
    comment: "Vim fazer apostilamento de documentos. Serviço rápido e bem organizado.",
    reviewer_name: "Sandra Regina Costa",
    create_time: "2025-08-19T10:10:00Z"
  },
  {
    rating: 3,
    comment: "Fila um pouco demorada para protesto de títulos, mas atendimento foi bom quando chegou minha vez.",
    reviewer_name: "Antonio Carlos Silva",
    create_time: "2025-08-21T16:45:00Z"
  },
  {
    rating: 5,
    comment: "Registro de empresa foi excepcional! Orientação completa e processo descomplicado.",
    reviewer_name: "Mariana Costa Pereira",
    create_time: "2025-08-23T12:30:00Z"
  },
  {
    rating: 4,
    comment: "Fiz inventário e partilha. Processo complexo mas bem explicado pela equipe.",
    reviewer_name: "José Roberto Lima",
    create_time: "2025-08-26T09:00:00Z"
  },
  {
    rating: 5,
    comment: "Atendimento para retificação de registro civil foi perfeito. Muito obrigado!",
    reviewer_name: "Beatriz Santos Oliveira",
    create_time: "2025-08-29T15:15:00Z"
  },

  // Alguns reviews neutros/mistos
  {
    rating: 3,
    comment: "Atendimento no E-notariado foi ok, mas demorou um pouco. Certificação digital funcionou bem no final.",
    reviewer_name: "Gustavo Pereira Santos",
    create_time: "2025-08-03T10:15:00Z"
  },
  {
    rating: 4,
    comment: "Bom serviço no setor digital. Explicaram sobre E-notariado, mas teve fila um pouco longa.",
    reviewer_name: "Mariana Costa Silva",
    create_time: "2025-08-07T16:45:00Z"
  },

  // Reviews negativos (poucos, para teste de alertas)
  {
    rating: 2,
    comment: "Problemas com o sistema de E-notariado. Demorou muito e não conseguiram resolver minha questão com certificação digital.",
    reviewer_name: "José Roberto Santos",
    create_time: "2025-08-10T13:20:00Z"
  },
  {
    rating: 1,
    comment: "Péssimo atendimento no setor digital. E-notariado não funcionou e ninguém soube explicar direito. Muito tempo perdido!",
    reviewer_name: "Cristina Oliveira Costa",
    create_time: "2025-08-14T11:45:00Z"
  },
  {
    rating: 2,
    comment: "Sistema de certificação digital travando constantemente. E-notariado precisa melhorar muito!",
    reviewer_name: "Rafael Lima Pereira",
    create_time: "2025-08-18T14:50:00Z"
  },
  {
    rating: 2,
    comment: "Fila enorme e atendimento demorado. Vim só para uma autenticação simples e perdi a manhã inteira.",
    reviewer_name: "Pedro Henrique Costa",
    create_time: "2025-08-21T11:30:00Z"
  },
  {
    rating: 1,
    comment: "Sistema de agendamento não funciona direito. Cheguei no horário marcado e ainda esperei 2 horas!",
    reviewer_name: "Laura Silva Martins",
    create_time: "2025-08-25T13:45:00Z"
  }
];

function generateReviewId(review) {
  return `gbp_mock_${Buffer.from(`${review.reviewer_name}_${review.create_time}`)
    .toString('base64').replace(/[^a-zA-Z0-9]/g,'').slice(0, 40)}`;
}

function isEnotariadoRelated(comment) {
  const enotariadoKeywords = [
    'e-notariado', 'enotariado', 'assinatura digital', 'certificado digital',
    'certificação digital', 'setor digital', 'digital', 'notariado eletrônico'
  ];

  const lowerComment = comment.toLowerCase();
  return enotariadoKeywords.some(keyword => lowerComment.includes(keyword));
}

async function populateCompleteMockData() {
  console.log('🚀 Populando banco com TODOS os dados simulados de agosto/2025');
  console.log('📊 Total de reviews simulados:', ALL_MOCK_REVIEWS.length);

  const batchId = `complete_mock_august_2025_${Date.now()}`;
  let rawInserted = 0;
  let reviewsInserted = 0;
  let correlated = 0;

  try {
    // FASE 1: Inserir TODOS os reviews na tabela reviews_raw (sem filtros)
    console.log('\n📥 FASE 1: Populando reviews_raw com TODOS os reviews...');

    for (const review of ALL_MOCK_REVIEWS) {
      const reviewId = generateReviewId(review);

      // Dados crus como a API retornaria
      const rawPayload = {
        review_id: reviewId,
        place_id: CARTORIO.place_id,
        rating: { value: review.rating, max_value: 5 },
        review_text: review.comment,
        reviewer_name: review.reviewer_name,
        timestamp: review.create_time,
        time: review.create_time,
        author: review.reviewer_name,
        text: review.comment,
        comment: review.comment,
        // Simular estrutura completa da API
        review_rating: review.rating,
        review_datetime_utc: review.create_time,
        review_likes: Math.floor(Math.random() * 10),
        review_photos: [],
        owner_answer: null,
        owner_answer_timestamp: null
      };

      await supabase.from('reviews_raw').upsert({
        review_id: reviewId,
        location_id: CARTORIO.location_id,
        payload: rawPayload,
        received_at: new Date().toISOString()
      });

      rawInserted++;
      console.log(`✅ Reviews Raw: ${rawInserted}/${ALL_MOCK_REVIEWS.length} - ${review.reviewer_name} (${review.rating}⭐)`);
    }

    console.log(`\n✅ FASE 1 concluída: ${rawInserted} reviews inseridos na tabela reviews_raw`);

    // FASE 2: Processar reviews_raw e popular tabela reviews (usando os mesmos dados inseridos)
    console.log('\n📋 FASE 2: Processando dados inseridos para tabela reviews...');

    // Usar os mesmos dados que acabamos de inserir, em vez de buscar do banco
    for (const review of ALL_MOCK_REVIEWS) {
      const reviewId = generateReviewId(review);

      // Normalizar dados para tabela reviews
      const normalized = {
        review_id: reviewId,
        location_id: CARTORIO.location_id,
        rating: review.rating,
        comment: review.comment,
        reviewer_name: review.reviewer_name,
        is_anonymous: false,
        create_time: review.create_time,
        update_time: null,
        reply_text: null,
        reply_time: null,
        collection_source: 'mock_data_complete_august_2025',
        collection_batch_id: batchId,
        processed_at: new Date().toISOString()
      };

      const { error } = await supabase.from('reviews').upsert(normalized);
      if (error) {
        console.error('Erro ao salvar review normalizado', reviewId, error.message);
        continue;
      }

      reviewsInserted++;
    }

    console.log(`\n✅ FASE 2 concluída: ${reviewsInserted} reviews normalizados inseridos na tabela reviews`);

    // FASE 3: Aguardar processamento automático das correlações
    console.log('\n⏳ FASE 3: Aguardando processamento das correlações automáticas...');
    await new Promise(r => setTimeout(r, 5000)); // Dar tempo para os triggers

    // Verificar correlações encontradas
    const { data: insertedReviews } = await supabase
      .from('reviews')
      .select('review_id, create_time, comment')
      .eq('collection_batch_id', batchId);

    if (insertedReviews) {
      const { data: correlations } = await supabase
        .from('review_collaborators')
        .select('review_id, collaborator_id, match_score')
        .in('review_id', insertedReviews.map(r => r.review_id));

      correlated = correlations ? correlations.length : 0;

      console.log(`\n📈 Estatísticas do Batch Completo ${batchId}:`);
      console.log(`   📝 Total de reviews crus (reviews_raw): ${rawInserted}`);
      console.log(`   📋 Reviews normalizados (reviews): ${reviewsInserted}`);
      console.log(`   🎯 Reviews correlacionados: ${correlated}`);
      console.log(`   📊 Taxa de correlação: ${reviewsInserted ? ((correlated / reviewsInserted) * 100).toFixed(1) : 0}%`);

      // Contar reviews relacionados ao E-notariado
      const enotariadoCount = ALL_MOCK_REVIEWS.filter(r => isEnotariadoRelated(r.comment)).length;
      const nonEnotariadoCount = ALL_MOCK_REVIEWS.length - enotariadoCount;

      console.log(`   🎯 Reviews sobre E-notariado: ${enotariadoCount}`);
      console.log(`   🏛️ Reviews sobre outros serviços: ${nonEnotariadoCount}`);

      if (correlations && correlations.length > 0) {
        console.log('\n🎯 Correlações encontradas:');
        const correlationDetails = await Promise.all(
          correlations.slice(0, 10).map(async (corr) => {
            const review = insertedReviews.find(r => r.review_id === corr.review_id);
            const { data: collaborator } = await supabase
              .from('collaborators')
              .select('full_name')
              .eq('id', corr.collaborator_id)
              .single();

            return {
              collaborator: collaborator?.full_name || `ID: ${corr.collaborator_id}`,
              comment: review?.comment?.substring(0, 60) + '...' || 'N/A',
              score: corr.match_score
            };
          })
        );

        correlationDetails.forEach((detail, idx) => {
          console.log(`   ${idx + 1}. ${detail.collaborator} → "${detail.comment}" (score: ${detail.score})`);
        });
      }
    }

    console.log('\n✅ População completa realizada com sucesso!');
    console.log('🎉 Arquitetura corrigida: reviews_raw contém TODOS os dados, reviews contém dados processados!');

    return batchId;

  } catch (error) {
    console.error('❌ Erro durante a população completa:', error.message);
    process.exit(1);
  }
}

async function showCompleteSystemStatus(batchId) {
  console.log('\n📊 STATUS COMPLETO DO SISTEMA APÓS CORREÇÃO:');

  // Contagem total por tabela
  const { count: totalRaw } = await supabase
    .from('reviews_raw')
    .select('*', { count: 'exact', head: true });

  const { count: totalReviews } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true });

  const { count: totalCorrelations } = await supabase
    .from('review_collaborators')
    .select('*', { count: 'exact', head: true });

  // Reviews de agosto/2025
  const { count: reviewsAug2025 } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .gte('create_time', '2025-08-01T00:00:00Z')
    .lt('create_time', '2025-09-01T00:00:00Z');

  console.log(`   📥 Reviews Raw (todos): ${totalRaw || 0}`);
  console.log(`   📋 Reviews Normalizados: ${totalReviews || 0}`);
  console.log(`   📅 Reviews agosto/2025: ${reviewsAug2025 || 0}`);
  console.log(`   🎯 Correlações encontradas: ${totalCorrelations || 0}`);
  console.log(`   👥 Colaboradores ativos: 9`);
  console.log(`   📊 Taxa de correlação agosto/2025: ${reviewsAug2025 ? ((totalCorrelations / reviewsAug2025) * 100).toFixed(1) : 0}%`);

  // Verificar distribuição por tipo de review
  const { data: sampleReviews } = await supabase
    .from('reviews')
    .select('comment')
    .eq('collection_batch_id', batchId)
    .limit(5);

  console.log('\n📝 Amostra de reviews na tabela reviews:');
  if (sampleReviews && sampleReviews.length > 0) {
    sampleReviews.forEach((review, idx) => {
      const isEnotariado = isEnotariadoRelated(review.comment);
      console.log(`   ${idx + 1}. ${isEnotariado ? '🎯' : '🏛️'} ${review.comment.substring(0, 80)}...`);
    });
  }
}

if (require.main === module) {
  populateCompleteMockData()
    .then((batchId) => showCompleteSystemStatus(batchId))
    .catch(err => {
      console.error('Erro geral:', err.message);
      process.exit(1);
    });
}
