// Teste de integração com DataForSEO
// Este arquivo pode ser executado com Node.js para testar a API

const axios = require('axios');

// Configurações do DataForSEO
const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const AUTH_B64 = 'aWFAY2FydG9yaW9wYXVsaXN0YS5jb20uYnI6ZmE2YmQxOGMyNTBmOTY5Mg=='; // Do .env

// Função para testar API de local finder com formato mais simples
async function testLocalFinderSimple() {
  try {
    console.log('🔍 Testando API de local finder com formato mais simples...');
    
    const response = await axios.post(`${DATAFORSEO_BASE}/serp/google/local_finder/live/advanced`, [{
      keyword: 'cartório paulista',
      language_name: 'Portuguese',
      location_name: 'Brazil',
      google_domain: 'google.com.br'
    }], {
      headers: {
        'Authorization': `Basic ${AUTH_B64}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ API de local finder funcionando!');
    console.log('📊 Resposta:', JSON.stringify(response.data, null, 2));
    
    return response.data;
    
  } catch (error) {
    console.error('❌ Erro na API de local finder:', error.response?.data || error.message);
    return null;
  }
}

// Função para testar API de Google Maps com formato mais simples
async function testGoogleMapsSimple() {
  try {
    console.log('\n🔍 Testando API de Google Maps com formato mais simples...');
    
    const response = await axios.post(`${DATAFORSEO_BASE}/serp/google/maps/live/advanced`, [{
      keyword: 'cartório paulista',
      language_name: 'Portuguese',
      location_name: 'Brazil',
      google_domain: 'google.com.br'
    }], {
      headers: {
        'Authorization': `Basic ${AUTH_B64}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ API de Google Maps funcionando!');
    console.log('📊 Resposta:', JSON.stringify(response.data, null, 2));
    
    return response.data;
    
  } catch (error) {
    console.error('❌ Erro na API de Google Maps:', error.response?.data || error.message);
    return null;
  }
}

// Função para testar API de business data com formato mais simples
async function testBusinessDataSimple() {
  try {
    console.log('\n🔍 Testando API de business data com formato mais simples...');
    
    const response = await axios.post(`${DATAFORSEO_BASE}/business_data/google/locations/search/live/advanced`, [{
      keyword: 'cartório paulista',
      language_name: 'Portuguese',
      location_name: 'Brazil'
    }], {
      headers: {
        'Authorization': `Basic ${AUTH_B64}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ API de business data funcionando!');
    console.log('📊 Resposta:', JSON.stringify(response.data, null, 2));
    
    return response.data;
    
  } catch (error) {
    console.error('❌ Erro na API de business data:', error.response?.data || error.message);
    return null;
  }
}

// Função para testar API de reviews com formato mais simples
async function testReviewsSimple() {
  try {
    console.log('\n🔍 Testando API de reviews com formato mais simples...');
    
    const response = await axios.post(`${DATAFORSEO_BASE}/business_data/google/reviews/live/advanced`, [{
      keyword: 'cartório paulista',
      language_name: 'Portuguese',
      location_name: 'Brazil'
    }], {
      headers: {
        'Authorization': `Basic ${AUTH_B64}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ API de reviews funcionando!');
    console.log('📊 Resposta:', JSON.stringify(response.data, null, 2));
    
    return response.data;
    
  } catch (error) {
    console.error('❌ Erro na API de reviews:', error.response?.data || error.message);
    return null;
  }
}

// Função para testar API de local finder com formato diferente
async function testLocalFinderDifferent() {
  try {
    console.log('\n🔍 Testando API de local finder com formato diferente...');
    
    const response = await axios.post(`${DATAFORSEO_BASE}/serp/google/local_finder/live/advanced`, [{
      keyword: 'cartório paulista',
      language_name: 'Portuguese',
      location_name: 'Brazil',
      google_domain: 'google.com.br',
      device: 'desktop',
      depth: 100
    }], {
      headers: {
        'Authorization': `Basic ${AUTH_B64}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ API de local finder funcionando!');
    console.log('📊 Resposta:', JSON.stringify(response.data, null, 2));
    
    return response.data;
    
  } catch (error) {
    console.error('❌ Erro na API de local finder:', error.response?.data || error.message);
    return null;
  }
}

// Executar testes
async function runTests() {
  console.log('🧪 Iniciando testes de integração com DataForSEO...\n');
  
  // Teste 1: Local finder simples
  const localFinderResult = await testLocalFinderSimple();
  
  // Teste 2: Google Maps simples
  const mapsResult = await testGoogleMapsSimple();
  
  // Teste 3: Business data simples
  const businessDataResult = await testBusinessDataSimple();
  
  // Teste 4: Reviews simples
  const reviewsResult = await testReviewsSimple();
  
  // Teste 5: Local finder com formato diferente
  const localFinderDifferentResult = await testLocalFinderDifferent();
  
  // Resumo dos resultados
  console.log('\n📊 RESUMO DOS TESTES:');
  console.log(`   Local Finder Simples: ${localFinderResult ? '✅ Funcionando' : '❌ Falhou'}`);
  console.log(`   Google Maps Simples: ${mapsResult ? '✅ Funcionando' : '❌ Falhou'}`);
  console.log(`   Business Data Simples: ${businessDataResult ? '✅ Funcionando' : '❌ Falhou'}`);
  console.log(`   Reviews Simples: ${reviewsResult ? '✅ Funcionando' : '❌ Falhou'}`);
  console.log(`   Local Finder Diferente: ${localFinderDifferentResult ? '✅ Funcionando' : '❌ Falhou'}`);
  
  console.log('\n✅ Testes concluídos!');
}

// Executar se o arquivo for chamado diretamente
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testLocalFinderSimple,
  testGoogleMapsSimple,
  testBusinessDataSimple,
  testReviewsSimple,
  testLocalFinderDifferent,
  runTests
};
