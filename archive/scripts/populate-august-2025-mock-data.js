const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDM1NjAsImV4cCI6MjA3MTk3OTU2MH0.9qYGEjUf7fz4_KNAcvSZfaiYLlGZllSYxlvNhXmGGWU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CARTORIO = {
  place_id: 'ChIJPXbxB0ZYzpQR-6-w9dl9lSI',
  location_id: 'cartorio_paulista_main'
};

// Dados simulados realistas para agosto/2025 - E-notariado
const MOCK_REVIEWS_AGOSTO_2025 = [
  // Reviews positivos com menção a colaboradores
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
  // Reviews positivos sem menção específica
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
  // Alguns reviews neutros/mistos
  {
    rating: 3,
    comment: "Atendimento no E-notariado foi ok, mas demorou um pouco. Certificação digital funcionou bem no final.",
    reviewer_name: "Gustavo Pereira Santos",
    create_time: "2025-08-06T10:15:00Z"
  },
  {
    rating: 4,
    comment: "Bom serviço no setor digital. Explicaram sobre E-notariado, mas teve fila um pouco longa.",
    reviewer_name: "Mariana Costa Silva",
    create_time: "2025-08-11T16:45:00Z"
  },
  {
    rating: 3,
    comment: "E-notariado funcionando, mas atendimento poderia ser mais ágil. Certificado digital ok.",
    reviewer_name: "Thiago Martins Rocha",
    create_time: "2025-08-19T12:30:00Z"
  },
  {
    rating: 4,
    comment: "Atendimento no E-notariado foi bom. Processo digital funcionou, mas teve demora inicial.",
    reviewer_name: "Isabela Fernandes Lima",
    create_time: "2025-08-26T15:15:00Z"
  },
  // Reviews negativos (poucos, para teste de alertas)
  {
    rating: 2,
    comment: "Problemas com o sistema de E-notariado. Demorou muito e não conseguiram resolver minha questão com certificação digital.",
    reviewer_name: "José Roberto Santos",
    create_time: "2025-08-09T13:20:00Z"
  },
  {
    rating: 1,
    comment: "Péssimo atendimento no setor digital. E-notariado não funcionou e ninguém soube explicar direito. Muito tempo perdido!",
    reviewer_name: "Cristina Oliveira Costa",
    create_time: "2025-08-16T11:45:00Z"
  },
  {
    rating: 2,
    comment: "Sistema de certificação digital travando constantemente. E-notariado precisa melhorar muito!",
    reviewer_name: "Rafael Lima Pereira",
    create_time: "2025-08-23T14:50:00Z"
  }
];

function generateReviewId(review) {
  return `gbp_mock_${Buffer.from(`${review.reviewer_name}_${review.create_time}`)
    .toString('base64').replace(/[^a-zA-Z0-9]/g,'').slice(0, 40)}`;
}

async function populateMockData() {
  console.log('🚀 Populando banco com dados simulados de agosto/2025 - E-notariado');
  console.log('📊 Total de reviews simulados:', MOCK_REVIEWS_AGOSTO_2025.length);

  const batchId = `mock_august_2025_${Date.now()}`;
  let inserted = 0;
  let correlated = 0;

  try {
    // Inserir reviews simulados
    for (const review of MOCK_REVIEWS_AGOSTO_2025) {
      const reviewId = generateReviewId(review);

      // Inserir no reviews_raw
      const rawPayload = {
        review_id: reviewId,
        place_id: CARTORIO.place_id,
        rating: { value: review.rating },
        review_text: review.comment,
        reviewer_name: review.reviewer_name,
        timestamp: review.create_time,
        time: review.create_time,
        author: review.reviewer_name,
        text: review.comment,
        comment: review.comment
      };

      await supabase.from('reviews_raw').upsert({
        review_id: reviewId,
        location_id: CARTORIO.location_id,
        payload: rawPayload
      });

      // Inserir no reviews normalizado
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
        collection_source: 'mock_data_august_2025',
        collection_batch_id: batchId,
        processed_at: new Date().toISOString()
      };

      const { error } = await supabase.from('reviews').upsert(normalized);
      if (error) {
        console.error('Erro ao salvar review', reviewId, error.message);
        continue;
      }

      inserted++;
      console.log(`✅ Review ${inserted}/${MOCK_REVIEWS_AGOSTO_2025.length}: ${review.reviewer_name} (${review.rating}⭐)`);
    }

    console.log(`\n📊 Inseridos ${inserted} reviews simulados no batch: ${batchId}`);

    // Aguardar processamento das correlações automáticas
    console.log('⏳ Aguardando processamento das correlações automáticas...');
    await new Promise(r => setTimeout(r, 3000));

    // Verificar correlações encontradas
    const { data: insertedReviews } = await supabase
      .from('reviews')
      .select('review_id, create_time')
      .eq('collection_batch_id', batchId);

    if (insertedReviews) {
      const { data: correlations } = await supabase
        .from('review_collaborators')
        .select('review_id, collaborator_id, match_score')
        .in('review_id', insertedReviews.map(r => r.review_id));

      correlated = correlations ? correlations.length : 0;

      console.log(`\n📈 Estatísticas do Batch ${batchId}:`);
      console.log(`   📊 Total de reviews: ${insertedReviews.length}`);
      console.log(`   🎯 Reviews correlacionados: ${correlated}`);
      console.log(`   📝 Reviews sem correlação: ${insertedReviews.length - correlated}`);
      console.log(`   📈 Taxa de correlação: ${((correlated / insertedReviews.length) * 100).toFixed(1)}%`);

      if (correlations && correlations.length > 0) {
        console.log('\n🎯 Correlações encontradas:');
        for (const corr of correlations.slice(0, 10)) { // Mostrar primeiras 10
          const review = MOCK_REVIEWS_AGOSTO_2025.find(r => generateReviewId(r) === corr.review_id);
          if (review) {
            console.log(`   • "${review.comment.substring(0, 60)}..." → Colaborador ID: ${corr.collaborator_id} (score: ${corr.match_score})`);
          }
        }
      }
    }

    console.log('\n✅ População concluída com sucesso!');
    console.log('🎉 Sistema pronto para testes do dashboard e correlação!');

  } catch (error) {
    console.error('❌ Erro durante a população:', error.message);
    process.exit(1);
  }
}

async function showSystemStatus() {
  console.log('\n📊 STATUS ATUAL DO SISTEMA:');

  // Contagem total de reviews
  const { count: totalReviews } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true });

  // Reviews de agosto/2025
  const { count: reviewsAug2025 } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .gte('create_time', '2025-08-01T00:00:00Z')
    .lt('create_time', '2025-09-01T00:00:00Z');

  // Correlações encontradas
  const { count: totalCorrelations } = await supabase
    .from('review_collaborators')
    .select('*', { count: 'exact', head: true });

  // Colaboradores ativos
  const { count: activeCollaborators } = await supabase
    .from('collaborators')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  console.log(`   📝 Total de reviews: ${totalReviews || 0}`);
  console.log(`   📅 Reviews agosto/2025: ${reviewsAug2025 || 0}`);
  console.log(`   🎯 Correlações encontradas: ${totalCorrelations || 0}`);
  console.log(`   👥 Colaboradores ativos: ${activeCollaborators || 0}`);
  console.log(`   📊 Taxa de correlação agosto/2025: ${reviewsAug2025 ? ((totalCorrelations / reviewsAug2025) * 100).toFixed(1) : 0}%`);
}

if (require.main === module) {
  populateMockData()
    .then(() => showSystemStatus())
    .catch(err => {
      console.error('Erro geral:', err.message);
      process.exit(1);
    });
}



