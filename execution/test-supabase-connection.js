/**
 * Layer 3 (Execution): Test Supabase connection and credentials
 *
 * Testa conexão e valida credenciais do Supabase
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Testando conexão com Supabase...\n');
console.log('Configuração atual:');
console.log('─'.repeat(70));
console.log('URL:', SUPABASE_URL || '❌ NÃO DEFINIDA');
console.log('ANON_KEY:', SUPABASE_ANON_KEY ? '✓ Definida' : '❌ NÃO DEFINIDA');
console.log('SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓ Definida' : '❌ NÃO DEFINIDA');
console.log('─'.repeat(70));

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌ Credenciais incompletas!');
  console.log('\n📋 Formato esperado para credenciais Supabase:');
  console.log('  SUPABASE_URL=https://[project-ref].supabase.co');
  console.log('  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...');
  console.log('\n💡 Obtenha as credenciais em:');
  console.log('  https://supabase.com/dashboard/project/[your-project]/settings/api');
  process.exit(1);
}

async function testConnection() {
  try {
    console.log('\n1️⃣ Testando conexão com SERVICE ROLE KEY...');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Testar listagem de tabelas
    const { data: tables, error: tablesError } = await supabase
      .from('gbp_accounts')
      .select('account_id')
      .limit(1);

    if (tablesError) {
      console.error('❌ Erro ao conectar:', tablesError.message);
      console.log('\n🔍 Detalhes do erro:', tablesError);

      if (tablesError.message.includes('fetch failed') || tablesError.message.includes('ENOTFOUND')) {
        console.log('\n💡 Possíveis causas:');
        console.log('  1. URL do Supabase está incorreta');
        console.log('  2. Projeto Supabase foi pausado/deletado');
        console.log('  3. Problemas de rede/firewall');
      } else if (tablesError.message.includes('JWT') || tablesError.message.includes('Invalid')) {
        console.log('\n💡 Possíveis causas:');
        console.log('  1. SERVICE_ROLE_KEY inválida ou expirada');
        console.log('  2. Chave não corresponde ao projeto');
      }

      return false;
    }

    console.log('✅ Conexão com Supabase estabelecida!');

    // Verificar estrutura das tabelas
    console.log('\n2️⃣ Verificando tabelas principais...');

    const tables_to_check = ['gbp_accounts', 'gbp_locations', 'reviews_raw', 'reviews'];
    for (const table of tables_to_check) {
      const { error } = await supabase.from(table).select('*').limit(0);
      if (error) {
        console.log(`  ❌ ${table}: ${error.message}`);
      } else {
        console.log(`  ✅ ${table}`);
      }
    }

    // Verificar constraint PRIMARY KEY
    console.log('\n3️⃣ Verificando PRIMARY KEY na tabela reviews...');

    const { data: pkData, error: pkError } = await supabase
      .from('reviews')
      .select('review_id')
      .limit(1);

    if (!pkError) {
      // Tentar upsert para verificar se PK funciona
      const testReview = {
        review_id: '__connection_test__',
        location_id: 'test',
        rating: 5,
        comment: 'Test',
        is_anonymous: false,
        create_time: new Date().toISOString()
      };

      const { error: upsertError } = await supabase
        .from('reviews')
        .upsert(testReview, { onConflict: 'review_id' });

      if (upsertError) {
        console.log('  ❌ Upsert falhou:', upsertError.message);
        if (upsertError.message.includes('constraint')) {
          console.log('  💡 PRIMARY KEY não está configurado corretamente');
        }
      } else {
        console.log('  ✅ PRIMARY KEY configurado corretamente');
        // Limpar
        await supabase.from('reviews').delete().eq('review_id', '__connection_test__');
      }
    }

    console.log('\n🎉 Teste de conexão concluído!');
    return true;

  } catch (error) {
    console.error('\n❌ Erro inesperado:', error.message);
    console.log('Stack:', error.stack);
    return false;
  }
}

testConnection();
