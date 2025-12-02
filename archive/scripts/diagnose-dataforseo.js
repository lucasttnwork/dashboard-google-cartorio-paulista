const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDM1NjAsImV4cCI6MjA3MTk3OTU2MH0.9qYGEjUf7fz4_KNAcvSZfaiYLlGZllSYxlvNhXmGGWU';
const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const DATAFORSEO_AUTH_B64 = 'aWFAY2FydG9yaW9wYXVsaXN0YS5jb20uYnI6ZmE2YmQxOGMyNTBmOTY5Mg==';

const CARTORIO = {
  place_id: 'ChIJPXbxB0ZYzpQR-6-w9dl9lSI',
  location_id: 'cartorio_paulista_main'
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testBasicConnectivity() {
  console.log('🔍 Testando conectividade básica com DataForSEO...');

  try {
    const payload = [{
      place_id: CARTORIO.place_id,
      language_name: 'Portuguese'
    }];

    const res = await fetch(`${DATAFORSEO_BASE}/business_data/google/reviews/task_post`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${DATAFORSEO_AUTH_B64}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log(`📡 Status HTTP: ${res.status}`);

    const data = await res.json();
    console.log('📋 Resposta da API:');
    console.log(JSON.stringify(data, null, 2));

    if (data.status_code === 20000 && data.tasks?.length > 0) {
      console.log('✅ Task criada com sucesso!');
      return data.tasks[0].id;
    } else {
      console.log('❌ Falha ao criar task:', data.status_message || 'Erro desconhecido');
      return null;
    }

  } catch (error) {
    console.error('❌ Erro de conectividade:', error.message);
    return null;
  }
}

async function testAccountStatus() {
  console.log('\n🔍 Testando status da conta DataForSEO...');

  try {
    const res = await fetch(`${DATAFORSEO_BASE}/account`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${DATAFORSEO_AUTH_B64}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`📡 Status HTTP: ${res.status}`);

    const data = await res.json();
    console.log('📋 Status da conta:');
    console.log(JSON.stringify(data, null, 2));

    // Análise detalhada da conta
    if (data.status_code === 20000) {
      console.log('\n📊 ANÁLISE DETALHADA DA CONTA:');
      console.log(`   💰 Créditos disponíveis: ${data.credits || 'N/A'}`);
      console.log(`   📈 Créditos gastos hoje: ${data.credits_spent_today || 'N/A'}`);
      console.log(`   📊 Limite diário: ${data.daily_limit || 'N/A'}`);
      console.log(`   🔄 Requests hoje: ${data.requests_today || 'N/A'}`);
      console.log(`   📅 Data de expiração: ${data.expiration_date || 'N/A'}`);

      // Verificar se tem acesso ao Google Reviews
      if (data.services && Array.isArray(data.services)) {
        const hasGoogleReviews = data.services.some(service =>
          service.name?.toLowerCase().includes('google') ||
          service.name?.toLowerCase().includes('reviews')
        );
        console.log(`   🎯 Acesso Google Reviews: ${hasGoogleReviews ? '✅' : '❌'}`);

        if (!hasGoogleReviews) {
          console.log('\n⚠️  AVISO: Sua conta pode não ter acesso ao serviço Google Reviews!');
          console.log('   📞 Contate o suporte DataForSEO para habilitar o serviço.');
        }
      }
    }

  } catch (error) {
    console.error('❌ Erro ao verificar conta:', error.message);
  }
}

async function testLiveEndpoint() {
  console.log('\n🔍 Testando endpoint live (sem task)...');

  try {
    const payload = [{
      place_id: CARTORIO.place_id,
      language_name: 'Portuguese',
      sort_by: 'newest',
      depth: 10
    }];

    const res = await fetch(`${DATAFORSEO_BASE}/business_data/google/reviews/live/advanced`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${DATAFORSEO_AUTH_B64}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log(`📡 Status HTTP: ${res.status}`);

    const data = await res.json();
    console.log('📋 Resposta do endpoint live:');
    console.log(JSON.stringify(data, null, 2));

    if (data.tasks && data.tasks[0]?.result) {
      const reviews = data.tasks[0].result.flatMap(r => r.items || []);
      console.log(`✅ Encontrados ${reviews.length} reviews via endpoint live`);
    }

  } catch (error) {
    console.error('❌ Erro no endpoint live:', error.message);
  }
}

async function testAlternativePayloads() {
  console.log('\n🔍 Testando payloads alternativos...');

  // Payload sem filtros de data
  const payloads = [
    {
      name: 'Payload Básico',
      payload: [{
        place_id: CARTORIO.place_id,
        language_name: 'Portuguese'
      }]
    },
    {
      name: 'Payload com CID',
      payload: [{
        cid: '2492036343902810107',
        language_name: 'Portuguese'
      }]
    },
    {
      name: 'Payload com localização',
      payload: [{
        location_name: 'Cartório Paulista São Paulo',
        language_name: 'Portuguese'
      }]
    }
  ];

  for (const test of payloads) {
    console.log(`\n📝 Testando: ${test.name}`);

    try {
      const res = await fetch(`${DATAFORSEO_BASE}/business_data/google/reviews/task_post`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${DATAFORSEO_AUTH_B64}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(test.payload)
      });

      const data = await res.json();

      if (data.status_code === 20000 && data.tasks?.length > 0) {
        console.log(`✅ ${test.name}: Task criada com sucesso - ID: ${data.tasks[0].id}`);
      } else {
        console.log(`❌ ${test.name}: ${data.status_message || 'Erro desconhecido'}`);
      }

    } catch (error) {
      console.error(`❌ ${test.name}: Erro de conectividade - ${error.message}`);
    }
  }
}

async function runDiagnosis() {
  console.log('🏥 INICIANDO DIAGNÓSTICO COMPLETO - DataForSEO API\n');
  console.log('='.repeat(60));

  await testAccountStatus();
  await testBasicConnectivity();
  await testLiveEndpoint();
  await testAlternativePayloads();

  console.log('\n' + '='.repeat(60));
  console.log('🏁 DIAGNÓSTICO CONCLUÍDO');
}

if (require.main === module) {
  runDiagnosis().catch(err => {
    console.error('Erro geral no diagnóstico:', err.message);
    process.exit(1);
  });
}



