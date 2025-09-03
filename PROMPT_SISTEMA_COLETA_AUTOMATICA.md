# 🤖 SISTEMA DE COLETA AUTOMÁTICA DE REVIEWS - CARTÓRIO PAULISTA

## 📋 **OBJETIVO PRINCIPAL**

Implementar um sistema completo de coleta automática de reviews do Google Business Profile do Cartório Paulista, com estrutura de banco otimizada, sistema de monitoramento de colaboradores e pipeline de processamento em tempo real.

---

## 🗄️ **PARTE 1: MELHORIA DA ESTRUTURA DO BANCO DE DADOS**

### **1.1 Problemas Identificados na Estrutura Atual**

**❌ PROBLEMAS:**
- ✅ Tabela `collaborators` existe mas precisa ser expandida com setores
- ❌ Falta campo `department/sector` na tabela colaborators
- ❌ Falta campo `received_at` corrigido na tabela reviews_raw (está como `executed_at`)
- ❌ Falta índices otimizados para buscas de colaboradores
- ❌ Falta campos de metadados para tracking da coleta automática

### **1.2 Script de Migração para Melhorar a Estrutura**

```sql
-- MIGRAÇÃO 1: Melhorar tabela de colaboradores
ALTER TABLE collaborators 
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS position TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- MIGRAÇÃO 2: Corrigir campo na reviews_raw  
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'reviews_raw' AND column_name = 'executed_at') THEN
        ALTER TABLE reviews_raw RENAME COLUMN executed_at TO received_at;
    END IF;
END $$;

-- MIGRAÇÃO 3: Adicionar campos de tracking na tabela reviews
ALTER TABLE reviews 
ADD COLUMN IF NOT EXISTS collection_source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS collection_batch_id TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ DEFAULT now();

-- MIGRAÇÃO 4: Adicionar metadados na gbp_locations
ALTER TABLE gbp_locations
ADD COLUMN IF NOT EXISTS last_review_sync TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS total_reviews_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS is_monitoring_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sync_frequency_hours INTEGER DEFAULT 6;

-- MIGRAÇÃO 5: Criar tabela de tracking de coletas
CREATE TABLE IF NOT EXISTS collection_runs (
    id BIGSERIAL PRIMARY KEY,
    location_id TEXT REFERENCES gbp_locations(location_id) ON DELETE CASCADE,
    run_type TEXT NOT NULL CHECK (run_type IN ('manual', 'scheduled', 'webhook')),
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    reviews_found INTEGER DEFAULT 0,
    reviews_new INTEGER DEFAULT 0,
    reviews_updated INTEGER DEFAULT 0,
    error_message TEXT,
    execution_time_ms INTEGER,
    api_cost DECIMAL(10,4) DEFAULT 0.0,
    metadata JSONB
);

-- MIGRAÇÃO 6: Tabela para configurações de monitoramento
CREATE TABLE IF NOT EXISTS monitoring_config (
    location_id TEXT PRIMARY KEY REFERENCES gbp_locations(location_id) ON DELETE CASCADE,
    auto_collection_enabled BOOLEAN DEFAULT true,
    collection_frequency_hours INTEGER DEFAULT 6,
    alert_on_new_review BOOLEAN DEFAULT true,
    alert_on_negative_review BOOLEAN DEFAULT true,
    alert_rating_threshold INTEGER DEFAULT 3,
    webhook_url TEXT,
    last_modified TIMESTAMPTZ DEFAULT now()
);

-- MIGRAÇÃO 7: Melhorar índices para performance
CREATE INDEX IF NOT EXISTS idx_reviews_collection_source ON reviews(collection_source, processed_at);
CREATE INDEX IF NOT EXISTS idx_reviews_batch ON reviews(collection_batch_id) WHERE collection_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collaborators_name_trgm ON collaborators USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_collaborators_aliases_gin ON collaborators USING gin (aliases);
CREATE INDEX IF NOT EXISTS idx_collection_runs_location_status ON collection_runs(location_id, status, started_at);

-- MIGRAÇÃO 8: Função para busca inteligente de colaboradores
CREATE OR REPLACE FUNCTION find_collaborator_mentions(review_text TEXT)
RETURNS TABLE (
    collaborator_id BIGINT,
    full_name TEXT,
    matched_alias TEXT,
    match_score REAL,
    snippet TEXT
) LANGUAGE plpgsql AS $$
DECLARE
    collab RECORD;
    alias_text TEXT;
    match_pos INTEGER;
    context_start INTEGER;
    context_end INTEGER;
    snippet_text TEXT;
    score REAL;
BEGIN
    -- Buscar por nome completo e aliases
    FOR collab IN 
        SELECT c.id, c.full_name, c.aliases, c.department
        FROM collaborators c 
        WHERE c.is_active = true
    LOOP
        -- Verificar nome completo (case insensitive)
        match_pos := position(lower(collab.full_name) in lower(review_text));
        
        IF match_pos > 0 THEN
            -- Calcular snippet context
            context_start := greatest(1, match_pos - 50);
            context_end := least(length(review_text), match_pos + length(collab.full_name) + 50);
            snippet_text := substring(review_text from context_start for (context_end - context_start + 1));
            
            -- Score baseado na qualidade do match
            score := 0.9; -- Nome completo = alta confiança
            
            RETURN QUERY SELECT collab.id, collab.full_name, collab.full_name::TEXT, score, snippet_text;
        END IF;
        
        -- Verificar aliases
        IF collab.aliases IS NOT NULL THEN
            FOREACH alias_text IN ARRAY collab.aliases
            LOOP
                match_pos := position(lower(alias_text) in lower(review_text));
                
                IF match_pos > 0 THEN
                    context_start := greatest(1, match_pos - 50);
                    context_end := least(length(review_text), match_pos + length(alias_text) + 50);
                    snippet_text := substring(review_text from context_start for (context_end - context_start + 1));
                    
                    -- Score menor para aliases
                    score := 0.7;
                    
                    RETURN QUERY SELECT collab.id, collab.full_name, alias_text, score, snippet_text;
                END IF;
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- MIGRAÇÃO 9: Trigger para processar menções automaticamente
CREATE OR REPLACE FUNCTION process_collaborator_mentions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    mention RECORD;
BEGIN
    -- Limpar menções anteriores se for um update
    IF TG_OP = 'UPDATE' THEN
        DELETE FROM review_collaborators WHERE review_id = NEW.review_id;
    END IF;
    
    -- Processar menções se há comentário
    IF NEW.comment IS NOT NULL AND length(trim(NEW.comment)) > 0 THEN
        FOR mention IN 
            SELECT * FROM find_collaborator_mentions(NEW.comment)
        LOOP
            INSERT INTO review_collaborators (
                review_id, 
                collaborator_id, 
                mention_snippet, 
                match_score
            ) VALUES (
                NEW.review_id,
                mention.collaborator_id,
                mention.snippet,
                mention.match_score
            ) ON CONFLICT (review_id, collaborator_id) DO UPDATE SET
                mention_snippet = EXCLUDED.mention_snippet,
                match_score = EXCLUDED.match_score;
        END LOOP;
    END IF;
    
    RETURN NEW;
END $$;

-- Criar trigger se não existir
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'process_collaborator_mentions_trg'
    ) THEN
        CREATE TRIGGER process_collaborator_mentions_trg
        AFTER INSERT OR UPDATE OF comment ON reviews
        FOR EACH ROW EXECUTE FUNCTION process_collaborator_mentions();
    END IF;
END $$;

-- MIGRAÇÃO 10: Inserir dados do Cartório Paulista
INSERT INTO gbp_locations (
    location_id,
    name,
    title,
    place_id,
    cid,
    website,
    address,
    phone,
    current_rating,
    total_reviews_count,
    last_review_sync
) VALUES (
    'cartorio_paulista_main',
    'Cartório Paulista',
    'Cartório Paulista - 2º Cartório de Notas de São Paulo',
    'ChIJPXbxB0ZYzpQR-6-w9dl9lSI',
    '2492036343902810107',
    'https://cartoriopaulista.com.br/',
    'Av. Paulista, 1776 - Bela Vista, São Paulo - SP, 01310-200',
    '+55113357-8844',
    4.8,
    8537,
    now()
) ON CONFLICT (place_id) DO UPDATE SET
    name = EXCLUDED.name,
    title = EXCLUDED.title,
    website = EXCLUDED.website,
    address = EXCLUDED.address,
    phone = EXCLUDED.phone,
    current_rating = EXCLUDED.current_rating,
    total_reviews_count = EXCLUDED.total_reviews_count,
    last_review_sync = EXCLUDED.last_review_sync;

-- Configurar monitoramento para o Cartório Paulista
INSERT INTO monitoring_config (
    location_id,
    auto_collection_enabled,
    collection_frequency_hours,
    alert_on_new_review,
    alert_on_negative_review,
    alert_rating_threshold
) VALUES (
    'cartorio_paulista_main',
    true,
    6, -- Coleta a cada 6 horas
    true,
    true,
    3 -- Alert para reviews <= 3 estrelas
) ON CONFLICT (location_id) DO UPDATE SET
    auto_collection_enabled = EXCLUDED.auto_collection_enabled,
    collection_frequency_hours = EXCLUDED.collection_frequency_hours,
    alert_on_new_review = EXCLUDED.alert_on_new_review,
    alert_on_negative_review = EXCLUDED.alert_on_negative_review,
    alert_rating_threshold = EXCLUDED.alert_rating_threshold,
    last_modified = now();
```

---

## 👥 **PARTE 2: POPULAÇÃO DA TABELA DE COLABORADORES**

### **2.1 Script para Adicionar Colaboradores do Cartório**

```sql
-- Inserir colaboradores comuns de cartórios (adaptar conforme necessário)
INSERT INTO collaborators (full_name, aliases, department, position, is_active) VALUES
-- Diretoria
('João Silva', ARRAY['João', 'Dr. João', 'João Silva'], 'Diretoria', 'Tabelião Titular', true),
('Maria Santos', ARRAY['Maria', 'Dra. Maria', 'Maria Santos'], 'Diretoria', 'Tabeliã Substituta', true),

-- Atendimento
('Ana Costa', ARRAY['Ana', 'Aninha'], 'Atendimento', 'Escrevente', true),
('Carlos Oliveira', ARRAY['Carlos', 'Carlão'], 'Atendimento', 'Escrevente', true),
('Juliana Lima', ARRAY['Juliana', 'Juli'], 'Atendimento', 'Auxiliar', true),
('Pedro Souza', ARRAY['Pedro'], 'Atendimento', 'Auxiliar', true),

-- Setor de Reconhecimento de Firmas
('Fernanda Rocha', ARRAY['Fernanda', 'Fê'], 'Reconhecimento', 'Escrevente', true),
('Roberto Alves', ARRAY['Roberto', 'Beto'], 'Reconhecimento', 'Auxiliar', true),

-- E-Notariado
('Camila Ferreira', ARRAY['Camila', 'Cami'], 'E-Notariado', 'Especialista Digital', true),
('Lucas Barbosa', ARRAY['Lucas'], 'E-Notariado', 'Técnico', true),

-- Procurações
('Patrícia Gomes', ARRAY['Patrícia', 'Pati'], 'Procurações', 'Escrevente', true),
('Marcos Dias', ARRAY['Marcos'], 'Procurações', 'Auxiliar', true),

-- Escrituras
('Renata Silva', ARRAY['Renata'], 'Escrituras', 'Escrevente Juramentada', true),
('Eduardo Martins', ARRAY['Eduardo', 'Edu'], 'Escrituras', 'Escrevente', true),

-- Testamentos
('Silvana Costa', ARRAY['Silvana', 'Sil'], 'Testamentos', 'Escrevente Especializada', true),

-- Administrativo
('Carla Mendes', ARRAY['Carla'], 'Administrativo', 'Gerente Administrativa', true),
('José Ribeiro', ARRAY['José', 'Zé'], 'Administrativo', 'Auxiliar Administrativo', true),

-- Protocolo
('Larissa Santos', ARRAY['Larissa', 'Lari'], 'Protocolo', 'Protocolista', true),
('Bruno Lima', ARRAY['Bruno'], 'Protocolo', 'Auxiliar de Protocolo', true)

ON CONFLICT (full_name) DO UPDATE SET
    aliases = EXCLUDED.aliases,
    department = EXCLUDED.department,
    position = EXCLUDED.position,
    is_active = EXCLUDED.is_active,
    updated_at = now();
```

---

## 🔄 **PARTE 3: SISTEMA DE COLETA AUTOMÁTICA**

### **3.1 Edge Function: `auto-collector`**

```typescript
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';

interface CollectionConfig {
  location_id: string;
  place_id: string;
  cid: string;
  auto_collection_enabled: boolean;
  collection_frequency_hours: number;
}

interface ReviewData {
  review_id: string;
  rating: number;
  comment: string;
  reviewer_name: string;
  is_anonymous: boolean;
  create_time: string;
  update_time?: string;
  reply_text?: string;
  reply_time?: string;
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const dataforSeoAuth = Deno.env.get('DATAFORSEO_AUTH_B64')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === 'GET') {
      return new Response(JSON.stringify({
        message: "Auto Collector funcionando",
        timestamp: new Date().toISOString(),
        endpoints: {
          run_collection: "POST /run-collection",
          check_status: "GET /status",
          force_sync: "POST /force-sync"
        }
      }), { 
        status: 200, 
        headers: { "Content-Type": "application/json" }
      });
    }

    if (req.method === 'POST') {
      const { action, location_id, force = false } = await req.json();
      
      switch (action) {
        case 'run_collection':
          return await runAutomaticCollection(supabase, dataforSeoAuth);
        case 'force_sync':
          return await forceSyncLocation(supabase, dataforSeoAuth, location_id);
        case 'check_status':
          return await checkCollectionStatus(supabase);
        default:
          return new Response(JSON.stringify({
            error: "Ação inválida. Use: run_collection, force_sync, check_status"
          }), { status: 400 });
      }
    }

    return new Response('Method Not Allowed', { status: 405 });

  } catch (error) {
    console.error('Erro na Auto Collector:', error);
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

async function runAutomaticCollection(supabase: any, authHeader: string) {
  console.log('🤖 Iniciando coleta automática...');
  
  // 1. Buscar localizações que precisam de sync
  const { data: locations, error: locError } = await supabase
    .from('gbp_locations')
    .select(`
      location_id,
      place_id,
      cid,
      name,
      last_review_sync,
      monitoring_config (
        auto_collection_enabled,
        collection_frequency_hours
      )
    `)
    .eq('monitoring_config.auto_collection_enabled', true);

  if (locError) {
    throw new Error(`Erro ao buscar localizações: ${locError.message}`);
  }

  const results = [];
  
  for (const location of locations) {
    const config = location.monitoring_config[0];
    if (!config?.auto_collection_enabled) continue;

    // Verificar se precisa sincronizar
    const lastSync = location.last_review_sync ? new Date(location.last_review_sync) : new Date(0);
    const now = new Date();
    const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

    if (hoursSinceSync >= config.collection_frequency_hours) {
      console.log(`🔄 Sincronizando ${location.name} (última sync: ${hoursSinceSync.toFixed(1)}h atrás)`);
      
      const result = await collectLocationReviews(
        supabase, 
        authHeader, 
        location.location_id,
        location.place_id,
        location.cid,
        'scheduled'
      );
      
      results.push({
        location_id: location.location_id,
        name: location.name,
        ...result
      });
    } else {
      console.log(`⏭️  Pulando ${location.name} (próxima sync em ${(config.collection_frequency_hours - hoursSinceSync).toFixed(1)}h)`);
    }
  }

  return new Response(JSON.stringify({
    success: true,
    message: "Coleta automática concluída",
    results: results,
    timestamp: new Date().toISOString()
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

async function forceSyncLocation(supabase: any, authHeader: string, locationId: string) {
  console.log(`🔧 Forçando sync para localização: ${locationId}`);
  
  const { data: location, error } = await supabase
    .from('gbp_locations')
    .select('location_id, place_id, cid, name')
    .eq('location_id', locationId)
    .single();

  if (error || !location) {
    return new Response(JSON.stringify({
      error: "Localização não encontrada"
    }), { status: 404 });
  }

  const result = await collectLocationReviews(
    supabase,
    authHeader,
    location.location_id,
    location.place_id,
    location.cid,
    'manual'
  );

  return new Response(JSON.stringify({
    success: true,
    location: location.name,
    ...result,
    timestamp: new Date().toISOString()
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

async function collectLocationReviews(
  supabase: any, 
  authHeader: string, 
  locationId: string,
  placeId: string,
  cid: string,
  runType: string
) {
  const startTime = Date.now();
  const batchId = `${locationId}_${Date.now()}`;
  
  // Registrar início da coleta
  const { data: run, error: runError } = await supabase
    .from('collection_runs')
    .insert({
      location_id: locationId,
      run_type: runType,
      status: 'running',
      metadata: { batch_id: batchId, place_id: placeId, cid: cid }
    })
    .select()
    .single();

  if (runError) {
    console.error('Erro ao registrar collection run:', runError);
  }

  try {
    // 1. Buscar reviews via DataForSEO
    const reviewsData = await fetchReviewsFromDataForSEO(authHeader, placeId, cid);
    
    if (!reviewsData.success) {
      throw new Error(`Erro na API DataForSEO: ${reviewsData.error}`);
    }

    const reviews = reviewsData.reviews || [];
    let newReviews = 0;
    let updatedReviews = 0;

    // 2. Processar cada review
    for (const reviewData of reviews) {
      const reviewId = generateReviewId(reviewData);
      
      // Salvar dados brutos
      await supabase
        .from('reviews_raw')
        .upsert({
          review_id: reviewId,
          location_id: locationId,
          payload: reviewData
        });

      // Normalizar e salvar review processado  
      const normalizedReview = normalizeReviewData(reviewData, locationId, batchId);
      
      const { error: reviewError } = await supabase
        .from('reviews')
        .upsert(normalizedReview);

      if (reviewError) {
        console.error(`Erro ao salvar review ${reviewId}:`, reviewError);
      } else {
        // Verificar se é novo ou atualizado
        const { data: existing } = await supabase
          .from('reviews')
          .select('processed_at')
          .eq('review_id', reviewId)
          .single();
          
        if (!existing?.processed_at) {
          newReviews++;
          
          // Enfileirar para processamento NLP
          await supabase.rpc('enqueue_nlp_review', { p_review_id: reviewId });
        } else {
          updatedReviews++;
        }
      }
    }

    // 3. Atualizar status da localização
    await supabase
      .from('gbp_locations')
      .update({
        last_review_sync: new Date().toISOString(),
        total_reviews_count: reviews.length
      })
      .eq('location_id', locationId);

    // 4. Finalizar collection run
    const executionTime = Date.now() - startTime;
    
    await supabase
      .from('collection_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        reviews_found: reviews.length,
        reviews_new: newReviews,
        reviews_updated: updatedReviews,
        execution_time_ms: executionTime
      })
      .eq('id', run?.id);

    return {
      success: true,
      reviews_found: reviews.length,
      reviews_new: newReviews,
      reviews_updated: updatedReviews,
      execution_time_ms: executionTime,
      batch_id: batchId
    };

  } catch (error) {
    // Marcar como falhou
    await supabase
      .from('collection_runs')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
        execution_time_ms: Date.now() - startTime
      })
      .eq('id', run?.id);

    throw error;
  }
}

async function fetchReviewsFromDataForSEO(authHeader: string, placeId: string, cid: string) {
  // Implementar busca por reviews específicos
  const response = await fetch(`${DATAFORSEO_BASE}/business_data/google/reviews/live/advanced`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{
      place_id: placeId,
      language_name: 'Portuguese',
      location_name: 'Brazil',
      sort_by: 'newest', // Reviews mais recentes primeiro
      depth: 100 // Quantidade de reviews para buscar
    }])
  });

  const data = await response.json();
  
  if (!response.ok || data.status_code !== 20000) {
    return {
      success: false,
      error: data.status_message || 'Erro na API DataForSEO'
    };
  }

  // Extrair reviews dos resultados
  const reviews = [];
  if (data.tasks && data.tasks[0]?.result) {
    for (const result of data.tasks[0].result) {
      if (result.items) {
        reviews.push(...result.items);
      }
    }
  }

  return {
    success: true,
    reviews: reviews
  };
}

function generateReviewId(reviewData: any): string {
  // Gerar ID único baseado nos dados do review
  const identifier = reviewData.timestamp || reviewData.time || 
                    `${reviewData.reviewer_name}_${reviewData.rating}_${Date.now()}`;
  return `review_${btoa(identifier).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32)}`;
}

function normalizeReviewData(rawReview: any, locationId: string, batchId: string): ReviewData {
  return {
    review_id: generateReviewId(rawReview),
    location_id: locationId,
    rating: rawReview.rating?.value || rawReview.rating || 5,
    comment: rawReview.review_text || rawReview.text || rawReview.comment || null,
    reviewer_name: rawReview.reviewer_name || rawReview.author || 'Anônimo',
    is_anonymous: !rawReview.reviewer_name && !rawReview.author,
    create_time: rawReview.timestamp || rawReview.time || new Date().toISOString(),
    update_time: rawReview.updated_timestamp || null,
    reply_text: rawReview.reply?.text || null,
    reply_time: rawReview.reply?.timestamp || null,
    collection_source: 'dataforseo_auto',
    collection_batch_id: batchId,
    processed_at: new Date().toISOString()
  };
}

async function checkCollectionStatus(supabase: any) {
  const { data: recentRuns, error } = await supabase
    .from('collection_runs')
    .select(`
      id,
      location_id,
      run_type,
      status,
      started_at,
      completed_at,
      reviews_found,
      reviews_new,
      reviews_updated,
      execution_time_ms,
      error_message,
      gbp_locations (name)
    `)
    .order('started_at', { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Erro ao buscar status: ${error.message}`);
  }

  return new Response(JSON.stringify({
    recent_runs: recentRuns,
    timestamp: new Date().toISOString()
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
```

### **3.2 Sistema de Agendamento (Cron)**

```typescript
// supabase/functions/scheduler/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  try {
    // Chamada para o auto-collector a cada 6 horas
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/auto-collector`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'run_collection' })
    });

    const result = await response.json();
    
    return new Response(JSON.stringify({
      scheduler_run: true,
      auto_collector_result: result,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
```

---

## 🧪 **PARTE 4: TESTES DO SISTEMA**

### **4.1 Script de Teste Completo**

```javascript
// test-auto-collection.js
const axios = require('axios');

const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Sua chave

async function testAutoCollection() {
  console.log('🧪 TESTANDO SISTEMA DE COLETA AUTOMÁTICA\\n');
  
  try {
    // 1. Testar status da Edge Function
    console.log('1️⃣ Testando status do Auto Collector...');
    const statusResponse = await axios.get(`${SUPABASE_URL}/functions/v1/auto-collector`, {
      headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    
    console.log('✅ Auto Collector ativo:', statusResponse.data.message);
    
    // 2. Forçar sync para testar
    console.log('\\n2️⃣ Testando coleta forçada...');
    const syncResponse = await axios.post(`${SUPABASE_URL}/functions/v1/auto-collector`, {
      action: 'force_sync',
      location_id: 'cartorio_paulista_main'
    }, {
      headers: { 
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Sync forçado:', syncResponse.data);
    
    // 3. Verificar status das coletas
    console.log('\\n3️⃣ Verificando histórico de coletas...');
    const historyResponse = await axios.post(`${SUPABASE_URL}/functions/v1/auto-collector`, {
      action: 'check_status'
    }, {
      headers: { 
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Últimas coletas:', historyResponse.data.recent_runs);
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.response?.data || error.message);
  }
}

async function testCollaboratorDetection() {
  console.log('\\n👥 TESTANDO DETECÇÃO DE COLABORADORES\\n');
  
  const testReviews = [
    "A Ana do atendimento foi muito gentil e eficiente!",
    "João Silva me ajudou muito com a documentação", 
    "Gostei do atendimento da Camila no e-notariado",
    "O Carlos foi super atencioso na procuração"
  ];
  
  // Testar função SQL diretamente via API
  for (const review of testReviews) {
    try {
      const response = await axios.post(`${SUPABASE_URL}/rest/v1/rpc/find_collaborator_mentions`, {
        review_text: review
      }, {
        headers: { 
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        }
      });
      
      console.log(`📝 Review: "${review}"`);
      console.log(`👤 Menções encontradas:`, response.data);
      console.log('---');
      
    } catch (error) {
      console.error(`❌ Erro ao testar review: ${error.message}`);
    }
  }
}

// Executar testes
async function runAllTests() {
  await testAutoCollection();
  await testCollaboratorDetection();
  
  console.log('\\n🎉 TESTES CONCLUÍDOS!');
}

runAllTests().catch(console.error);
```

---

## 📊 **PARTE 5: MONITORAMENTO E DASHBOARD**

### **5.1 Queries para Dashboard**

```sql
-- Query 1: Estatísticas gerais de coleta
SELECT 
    l.name,
    l.current_rating,
    l.total_reviews_count,
    l.last_review_sync,
    mc.collection_frequency_hours,
    COUNT(cr.id) as total_collection_runs,
    SUM(cr.reviews_new) as total_new_reviews,
    AVG(cr.execution_time_ms) as avg_execution_time
FROM gbp_locations l
LEFT JOIN monitoring_config mc ON l.location_id = mc.location_id  
LEFT JOIN collection_runs cr ON l.location_id = cr.location_id
WHERE cr.status = 'completed'
GROUP BY l.location_id, l.name, l.current_rating, l.total_reviews_count, 
         l.last_review_sync, mc.collection_frequency_hours;

-- Query 2: Reviews com menções a colaboradores
SELECT 
    r.review_id,
    r.rating,
    r.comment,
    r.reviewer_name,
    r.create_time,
    c.full_name as collaborator_mentioned,
    c.department,
    rc.match_score,
    rc.mention_snippet
FROM reviews r
JOIN review_collaborators rc ON r.review_id = rc.review_id
JOIN collaborators c ON rc.collaborator_id = c.id
ORDER BY r.create_time DESC;

-- Query 3: Performance por colaborador
SELECT 
    c.full_name,
    c.department,
    COUNT(rc.review_id) as mentions_count,
    AVG(r.rating) as avg_rating_when_mentioned,
    COUNT(CASE WHEN r.rating >= 4 THEN 1 END) as positive_mentions,
    COUNT(CASE WHEN r.rating <= 2 THEN 1 END) as negative_mentions
FROM collaborators c
LEFT JOIN review_collaborators rc ON c.id = rc.collaborator_id
LEFT JOIN reviews r ON rc.review_id = r.review_id
WHERE c.is_active = true
GROUP BY c.id, c.full_name, c.department
ORDER BY mentions_count DESC;

-- Query 4: Tendência de coletas por período
SELECT 
    DATE_TRUNC('day', started_at) as collection_date,
    COUNT(*) as total_runs,
    SUM(reviews_new) as new_reviews,
    SUM(reviews_updated) as updated_reviews,
    AVG(execution_time_ms) as avg_time_ms
FROM collection_runs
WHERE status = 'completed'
GROUP BY DATE_TRUNC('day', started_at)
ORDER BY collection_date DESC;
```

---

## 🎯 **RESUMO DE IMPLEMENTAÇÃO**

### **Ordem de Execução:**

1. **📊 ESTRUTURA**: Executar migrations do banco de dados
2. **👥 COLABORADORES**: Popular tabela de colaboradores  
3. **🤖 EDGE FUNCTIONS**: Deploy das funções auto-collector e scheduler
4. **🧪 TESTES**: Executar testes de validação
5. **📈 DASHBOARD**: Implementar visualizações

### **Resultados Esperados:**

- ✅ Coleta automática a cada 6 horas
- ✅ Detecção inteligente de menções a colaboradores
- ✅ Estrutura otimizada para análise de performance
- ✅ Sistema de alertas para reviews negativos
- ✅ Pipeline completo de processamento NLP

### **Benefícios:**

- 📊 **Dashboard Rico**: Métricas por colaborador e departamento
- 🔔 **Alertas Inteligentes**: Notificações para situações críticas  
- 📈 **Tendências**: Análise histórica de performance
- 👥 **Gestão de Pessoas**: Feedback específico por colaborador
- 🤖 **Automação Total**: Zero intervenção manual

---

**Status**: 🟢 **PRONTO PARA IMPLEMENTAÇÃO**  
**Tempo Estimado**: 2-3 horas para implementação completa  
**Próximo Passo**: Executar migrations e deploy das Edge Functions

