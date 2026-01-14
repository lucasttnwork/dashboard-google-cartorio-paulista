/**
 * Layer 3 (Execution): Fix PRIMARY KEY constraint on reviews table
 *
 * Este script adiciona a constraint PRIMARY KEY na tabela reviews
 * usando conexão direta ao PostgreSQL via Supabase.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('⌛ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'public' }
});

async function fixPrimaryKey() {
  console.log('🔧 Corrigindo PRIMARY KEY na tabela reviews...\n');

  // SQL para adicionar PRIMARY KEY se não existir
  const sql = `
    DO $$
    BEGIN
      -- Verificar se PRIMARY KEY já existe
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'reviews' AND c.contype = 'p'
      ) THEN
        -- Adicionar PRIMARY KEY
        ALTER TABLE reviews ADD PRIMARY KEY (review_id);
        RAISE NOTICE 'PRIMARY KEY adicionado com sucesso';
      ELSE
        RAISE NOTICE 'PRIMARY KEY já existe';
      END IF;
    END $$;
  `;

  try {
    // Usar uma query simples para testar primeiro se o upsert funciona
    const testData = {
      review_id: '__test_pk_fix__',
      location_id: 'cartorio-paulista-location',
      rating: 5,
      comment: 'Test review for PK fix',
      is_anonymous: false,
      create_time: new Date().toISOString()
    };

    console.log('1️⃣ Testando upsert atual (deve falhar se PK não existir)...');
    const { error: testError } = await supabase
      .from('reviews')
      .upsert(testData, { onConflict: 'review_id', ignoreDuplicates: false });

    if (testError) {
      console.log('❌ Upsert falhou (esperado):', testError.message);
      console.log('\n2️⃣ Tentando adicionar PRIMARY KEY via raw SQL...');

      // Tentar via query raw (pode não funcionar dependendo das permissões)
      const { error: sqlError } = await supabase.rpc('exec', { sql });

      if (sqlError) {
        console.log('⚠️ Não foi possível executar SQL via RPC:', sqlError.message);
        console.log('\n📋 Por favor, execute este SQL manualmente no Supabase SQL Editor:');
        console.log('─'.repeat(70));
        console.log('ALTER TABLE reviews ADD PRIMARY KEY (review_id);');
        console.log('─'.repeat(70));
        console.log('\nURL: ' + SUPABASE_URL.replace('.supabase.co', '.supabase.co/project/_/sql'));
        return false;
      }

      console.log('✅ PRIMARY KEY adicionado com sucesso!');

      // Testar novamente
      console.log('\n3️⃣ Testando upsert novamente...');
      const { error: retestError } = await supabase
        .from('reviews')
        .upsert(testData, { onConflict: 'review_id', ignoreDuplicates: false });

      if (retestError) {
        console.error('❌ Ainda há erro:', retestError.message);
        return false;
      }

      console.log('✅ Upsert funcionando corretamente!');
    } else {
      console.log('✅ PRIMARY KEY já está configurado corretamente!');
    }

    // Limpar registro de teste
    await supabase.from('reviews').delete().eq('review_id', '__test_pk_fix__');

    console.log('\n🎉 Tabela reviews está pronta para upserts!');
    return true;

  } catch (error) {
    console.error('❌ Erro inesperado:', error);
    console.log('\n📋 Execute este SQL manualmente no Supabase SQL Editor:');
    console.log('─'.repeat(70));
    console.log('ALTER TABLE reviews ADD PRIMARY KEY (review_id);');
    console.log('─'.repeat(70));
    return false;
  }
}

async function main() {
  const success = await fixPrimaryKey();
  process.exit(success ? 0 : 1);
}

main();
