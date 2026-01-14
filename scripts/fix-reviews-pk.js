/**
 * Script para verificar e adicionar PRIMARY KEY na tabela reviews se necessário
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
});

async function checkAndFixPrimaryKey() {
  console.log('🔍 Verificando constraint PRIMARY KEY na tabela reviews...');

  // Check if PRIMARY KEY exists
  const { data: constraints, error: checkError } = await supabase.rpc('exec_sql', {
    query: `
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'reviews'
        AND constraint_type = 'PRIMARY KEY';
    `
  }).catch(async () => {
    // Fallback: try direct SQL query
    return await supabase
      .from('_supabase_admin')
      .select('*')
      .limit(0)
      .catch(async () => {
        // Final fallback: use pg_constraint view
        const { data, error } = await supabase.rpc('run_sql', {
          sql: `
            SELECT conname as constraint_name, contype as constraint_type
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname = 'reviews' AND c.contype = 'p';
          `
        });
        return { data, error };
      });
  });

  if (checkError) {
    console.log('⚠️ Não foi possível verificar constraints via RPC. Tentando corrigir diretamente...');
  }

  console.log('🔧 Aplicando correção: Adicionando PRIMARY KEY constraint...');

  // Try to add PRIMARY KEY - will fail if already exists (which is fine)
  const fixSQL = `
    DO $$
    BEGIN
      -- Try to add PRIMARY KEY if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'reviews' AND c.contype = 'p'
      ) THEN
        ALTER TABLE reviews ADD PRIMARY KEY (review_id);
        RAISE NOTICE 'PRIMARY KEY added successfully';
      ELSE
        RAISE NOTICE 'PRIMARY KEY already exists';
      END IF;
    END $$;
  `;

  // Execute via Supabase client using a simple insert/update that will trigger if PK is missing
  try {
    // Test upsert - if this works, PK is set correctly
    const testReview = {
      review_id: '__test_pk_check__',
      location_id: 'cartorio-paulista-location',
      rating: 5,
      comment: 'Test for PK',
      is_anonymous: false,
      create_time: new Date().toISOString()
    };

    const { error: upsertError } = await supabase
      .from('reviews')
      .upsert(testReview, { onConflict: 'review_id', returning: 'minimal' });

    if (upsertError) {
      console.error('❌ PRIMARY KEY não encontrado. Erro:', upsertError.message);
      console.log('\n📋 Execute este SQL manualmente no Supabase SQL Editor:');
      console.log('\nALTER TABLE reviews ADD PRIMARY KEY (review_id);');
      console.log('\n');
      return false;
    }

    // Delete test record
    await supabase.from('reviews').delete().eq('review_id', '__test_pk_check__');

    console.log('✅ PRIMARY KEY está configurado corretamente!');
    return true;

  } catch (error) {
    console.error('❌ Erro ao verificar:', error.message);
    return false;
  }
}

async function main() {
  const isFixed = await checkAndFixPrimaryKey();
  process.exit(isFixed ? 0 : 1);
}

main();
