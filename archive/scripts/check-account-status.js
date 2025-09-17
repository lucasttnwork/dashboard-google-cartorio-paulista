// Usando fetch nativo do Node.js 18+
const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const DATAFORSEO_AUTH_B64 = 'aWFAY2FydG9yaW9wYXVsaXN0YS5jb20uYnI6ZmE2YmQxOGMyNTBmOTY5Mg==';

async function checkAccountStatus() {
  console.log('🔍 Verificando status detalhado da conta DataForSEO...');

  try {
    const res = await fetch(`${DATAFORSEO_BASE}/account`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${DATAFORSEO_AUTH_B64}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();
    console.log('📊 Status da conta:');
    console.log(JSON.stringify(data, null, 2));

    if (data && data.status_code === 20000) {
      console.log('\n✅ Conta ativa e funcionando');
    } else {
      console.log('\n❌ Problemas na conta:', data.status_message);
    }

  } catch (error) {
    console.error('❌ Erro ao verificar conta:', error.message);
  }
}

checkAccountStatus().catch(console.error);
