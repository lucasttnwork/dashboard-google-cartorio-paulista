/**
 * Layer 3 (Execution): Add PRIMARY KEY to reviews table via direct SQL
 *
 * Usa a REST API do Supabase para executar SQL raw
 */

require('dotenv').config();
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('⌛ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const SQL = `
-- Verificar e adicionar PRIMARY KEY se não existir
DO $$
BEGIN
  -- Verificar se PRIMARY KEY existe
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

console.log('🔧 Adicionando PRIMARY KEY na tabela reviews via SQL direto...\n');
console.log('SQL a ser executado:');
console.log('─'.repeat(70));
console.log(SQL);
console.log('─'.repeat(70));

// Extrair project ref da URL
const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');

// Usar a API REST do Supabase para executar SQL
const data = JSON.stringify({ query: SQL });

const options = {
  hostname: `${projectRef}.supabase.co`,
  port: 443,
  path: '/rest/v1/rpc/exec',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Length': data.length,
    'Prefer': 'return=representation'
  }
};

const req = https.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log('\n📡 Resposta do servidor:');
    console.log('Status:', res.statusCode);

    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('✅ SQL executado com sucesso!');
      console.log('Resposta:', responseData || 'OK');
    } else if (res.statusCode === 404) {
      console.log('❌ Endpoint não encontrado. O RPC "exec" não está disponível.');
      console.log('\n📋 Execute este SQL manualmente no Supabase SQL Editor:');
      console.log('URL:', `https://supabase.com/dashboard/project/${projectRef}/sql`);
      console.log('\nSQL:');
      console.log('ALTER TABLE reviews ADD PRIMARY KEY (review_id);');
    } else {
      console.log('❌ Erro:', responseData);
      console.log('\n📋 Execute este SQL manualmente no Supabase SQL Editor:');
      console.log('URL:', `https://supabase.com/dashboard/project/${projectRef}/sql`);
      console.log('\nSQL:');
      console.log('ALTER TABLE reviews ADD PRIMARY KEY (review_id);');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Erro na requisição:', error.message);
  console.log('\n📋 Execute este SQL manualmente no Supabase SQL Editor:');
  console.log(`URL: https://supabase.com/dashboard/project/${projectRef}/sql`);
  console.log('\nSQL:');
  console.log('ALTER TABLE reviews ADD PRIMARY KEY (review_id);');
});

req.write(data);
req.end();
