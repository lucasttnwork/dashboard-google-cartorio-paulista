# PRD - Sistema de Coleta Automatizada via Railway

## 🎯 Visão Geral do Produto

### **Objetivo Principal**
Desenvolver um sistema de coleta automatizada de avaliações do Google Business Profile que execute na Railway, substituindo a abordagem de Edge Functions por uma solução mais robusta, flexível e facilmente mantível.

### **Problema a Resolver**
- **Limitações atuais**: Edge Functions com timeouts, debugging complexo e dependências limitadas
- **Necessidade**: Sistema confiável para coleta diária de reviews com processamento completo
- **Oportunidade**: Aproveitar código Node.js já funcional e criar arquitetura escalável

### **Resultado Esperado**
Sistema autônomo que executa diariamente às 6h BRT, coleta reviews via Apify, normaliza dados, evita duplicatas e persiste no Supabase com logs estruturados e monitoramento robusto.

---

## 📋 Especificações Funcionais

### **F1 - Coleta Automatizada de Reviews**
**Narrativa**: O sistema deve executar automaticamente todos os dias às 6h BRT, conectar-se à API da Apify, buscar reviews atualizadas nas últimas 24 horas do Cartório Paulista e baixar todos os dados estruturados.

**Detalhes técnicos**:
- Usar `node-cron` com timezone Brasil/São_Paulo
- Conectar via `apify-client` com token seguro
- Parametrizar lookback de 24h e máximo de 200 reviews
- Implementar retry automático (3 tentativas com backoff exponencial)
- Logs estruturados para cada etapa da coleta

**Critérios de Aceitação**:
- ✅ Execução pontual às 6h BRT todos os dias
- ✅ Coleta bem-sucedida de reviews das últimas 24h
- ✅ Retry automático em caso de falha da Apify
- ✅ Logs detalhados de cada tentativa

### **F2 - Normalização e Validação de Dados**
**Narrativa**: Após receber dados brutos da Apify, o sistema deve transformá-los no formato padronizado do Supabase, validar integridade, extrair campos relevantes e preparar para persistência sem perda de informações.

**Detalhes técnicos**:
- Reutilizar `apify-normalizer.ts` existente (porte para CommonJS)
- Validar campos obrigatórios (review_id, rating, comment)
- Normalizar datas para formato ISO
- Extrair reviewer_info e response_data quando disponível
- Calcular `last_seen_at` como timestamp da coleta atual

**Critérios de Aceitação**:
- ✅ 100% dos reviews válidos são normalizados
- ✅ Campos obrigatórios sempre preenchidos
- ✅ Datas em formato ISO consistente
- ✅ Logs de reviews inválidos/descartados

### **F3 - Deduplicação Inteligente**
**Narrativa**: O sistema deve evitar inserção de reviews duplicadas usando `review_id` como chave primária, atualizando registros existentes quando houver mudanças nos dados (ex: novas respostas do estabelecimento) e inserindo apenas reviews genuinamente novas.

**Detalhes técnicos**:
- Query preliminar no Supabase para buscar `review_id`s existentes
- Comparação hash de campos relevantes para detectar mudanças
- Upsert inteligente: INSERT para novos, UPDATE para modificados
- Tracking de métricas: novos vs. atualizados vs. inalterados

**Critérios de Aceitação**:
- ✅ Zero duplicatas de `review_id`
- ✅ Updates corretos quando review muda
- ✅ Métricas precisas de inserções/atualizações
- ✅ Performance otimizada para lotes grandes

### **F4 - Persistência Transacional no Supabase**
**Narrativa**: Após processamento, o sistema deve persistir dados no Supabase usando transações para garantir consistência, atualizar tabelas `reviews`, `reviews_raw` e `gbp_locations`, registrar execução em `collection_runs` e calcular métricas atualizadas.

**Detalhes técnicos**:
- Conexão Supabase via service role key
- Transação única para todas as operações
- Batch inserts/updates para performance
- Atualização de métricas em `gbp_locations`
- Registro completo em `collection_runs` com metadata

**Critérios de Aceitação**:
- ✅ Transação atômica (tudo ou nada)
- ✅ Tabelas sincronizadas corretamente
- ✅ Métricas atualizadas em tempo real
- ✅ Logs de execução persistidos

### **F5 - Monitoramento e Alertas**
**Narrativa**: O sistema deve gerar logs estruturados para todas as operações, enviar métricas para Railway monitoring, detectar falhas automáticamente e notificar administradores via webhook quando necessário.

**Detalhes técnicos**:
- Winston logger com níveis (info, warn, error)
- Healthcheck endpoint para Railway
- Webhook de notificação para falhas críticas
- Métricas: reviews coletadas, tempo de execução, taxa de sucesso
- Dashboard de status acessível via HTTP

**Critérios de Aceitação**:
- ✅ Logs estruturados em JSON
- ✅ Healthcheck respondendo corretamente
- ✅ Alertas automáticos para falhas
- ✅ Dashboard de status funcional

---

## 🏗️ Especificações Técnicas

### **Arquitetura Geral**
```
railway-collector/
├── src/
│   ├── collectors/
│   │   ├── apify-collector.js      # Coleta via Apify Client
│   │   └── data-processor.js       # Normalização e validação
│   ├── storage/
│   │   ├── supabase-client.js      # Cliente Supabase configurado
│   │   └── deduplicator.js         # Lógica de deduplicação
│   ├── scheduler/
│   │   └── cron-manager.js         # Gerenciamento do cron
│   ├── monitoring/
│   │   ├── logger.js               # Winston configurado
│   │   ├── metrics.js              # Coleta de métricas
│   │   └── health-check.js         # Endpoint de saúde
│   └── utils/
│       ├── config.js               # Configurações centralizadas
│       └── validators.js           # Validadores de dados
├── server.js                       # Servidor principal Express
├── package.json
├── Dockerfile
└── railway.toml
```

### **Stack Tecnológica**
- **Runtime**: Node.js 18+ LTS
- **Scheduler**: `node-cron` com timezone support
- **HTTP Server**: Express.js para healthcheck/dashboard
- **Database**: `@supabase/supabase-js` client
- **Apify**: `apify-client` oficial
- **Logging**: `winston` com formatação JSON
- **Process Manager**: PM2 para produção
- **Deploy**: Railway com Dockerfile customizado

### **Configuração de Ambiente**
```env
# Apify Configuration
APIFY_TOKEN=apify_api_...
APIFY_ACTOR_ID=compass/Google-Maps-Reviews-Scraper
APIFY_MAX_REVIEWS=200
APIFY_LOOKBACK_HOURS=24

# Supabase Configuration
SUPABASE_URL=https://....supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_TABLE_REVIEWS=reviews
SUPABASE_TABLE_REVIEWS_RAW=reviews_raw
SUPABASE_TABLE_LOCATIONS=gbp_locations
SUPABASE_TABLE_RUNS=collection_runs

# Scheduling
CRON_SCHEDULE=0 6 * * *
TIMEZONE=America/Sao_Paulo

# Monitoring
WEBHOOK_URL=https://hooks.slack.com/... (opcional)
LOG_LEVEL=info
HEALTHCHECK_PORT=3000

# Business Logic
LOCATION_ID=cartorio-paulista-location
RETRY_ATTEMPTS=3
RETRY_DELAY_MS=5000
```

### **Fluxo de Execução Detalhado**

#### **1. Inicialização do Sistema**
```javascript
// server.js - Processo principal
const express = require('express');
const cron = require('node-cron');
const cronManager = require('./src/scheduler/cron-manager');
const healthCheck = require('./src/monitoring/health-check');

const app = express();
app.use('/health', healthCheck);
app.use('/status', statusDashboard);

// Inicializar cron job
cronManager.start();

app.listen(process.env.HEALTHCHECK_PORT || 3000);
```

#### **2. Execução do Cron Job**
```javascript
// src/scheduler/cron-manager.js
const cron = require('node-cron');
const collector = require('../collectors/apify-collector');
const processor = require('../collectors/data-processor');
const storage = require('../storage/supabase-client');
const logger = require('../monitoring/logger');

const JOB_SCHEDULE = process.env.CRON_SCHEDULE || '0 6 * * *';
const TIMEZONE = process.env.TIMEZONE || 'America/Sao_Paulo';

function start() {
  cron.schedule(JOB_SCHEDULE, executeCollection, {
    scheduled: true,
    timezone: TIMEZONE
  });
  
  logger.info('Cron scheduler started', { 
    schedule: JOB_SCHEDULE, 
    timezone: TIMEZONE 
  });
}

async function executeCollection() {
  const startTime = Date.now();
  const runId = await storage.createRun({
    started_at: new Date().toISOString(),
    run_type: 'scheduled',
    status: 'running'
  });
  
  try {
    // 1. Coletar reviews da Apify
    const rawReviews = await collector.fetchReviews();
    
    // 2. Normalizar e validar dados
    const normalizedReviews = await processor.normalize(rawReviews);
    
    // 3. Deduplicar contra base existente
    const { newReviews, updatedReviews } = await processor.deduplicate(normalizedReviews);
    
    // 4. Persistir no Supabase
    const result = await storage.persistReviews(newReviews, updatedReviews);
    
    // 5. Atualizar métricas da localização
    await storage.updateLocationMetrics();
    
    // 6. Finalizar run com sucesso
    await storage.finalizeRun(runId, {
      status: 'completed',
      execution_time_ms: Date.now() - startTime,
      reviews_found: rawReviews.length,
      reviews_new: result.inserted,
      reviews_updated: result.updated
    });
    
    logger.info('Collection completed successfully', result);
    
  } catch (error) {
    await storage.finalizeRun(runId, {
      status: 'failed',
      execution_time_ms: Date.now() - startTime,
      error_message: error.message
    });
    
    logger.error('Collection failed', { error: error.message });
    await notifyError(error);
  }
}
```

#### **3. Coleta via Apify**
```javascript
// src/collectors/apify-collector.js
const { ApifyClient } = require('apify-client');
const logger = require('../monitoring/logger');
const config = require('../utils/config');

class ApifyCollector {
  constructor() {
    this.client = new ApifyClient({ 
      token: config.APIFY_TOKEN 
    });
  }
  
  async fetchReviews(retryCount = 0) {
    try {
      const input = {
        startUrls: [{ url: config.GBP_URL }],
        maxReviews: config.APIFY_MAX_REVIEWS,
        reviewsFromLastHours: config.APIFY_LOOKBACK_HOURS,
        reviewsSort: 'newest',
        language: 'pt-BR',
        includeReviewAnswers: true
      };
      
      logger.info('Starting Apify collection', input);
      
      const run = await this.client.actor(config.APIFY_ACTOR_ID).call(input);
      
      if (run.status !== 'SUCCEEDED') {
        throw new Error(`Apify run failed: ${run.status}`);
      }
      
      const { items } = await this.client.dataset(run.defaultDatasetId)
        .listItems({ limit: config.APIFY_MAX_REVIEWS });
      
      logger.info('Apify collection completed', { 
        reviewsFound: items.length,
        runId: run.id 
      });
      
      return items;
      
    } catch (error) {
      if (retryCount < config.RETRY_ATTEMPTS) {
        logger.warn('Apify collection failed, retrying', { 
          attempt: retryCount + 1,
          error: error.message 
        });
        
        await this.delay(config.RETRY_DELAY_MS * Math.pow(2, retryCount));
        return this.fetchReviews(retryCount + 1);
      }
      
      throw error;
    }
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

#### **4. Normalização e Deduplicação**
```javascript
// src/collectors/data-processor.js
const logger = require('../monitoring/logger');
const storage = require('../storage/supabase-client');
const { normalizeApifyReviews } = require('../utils/apify-normalizer');

class DataProcessor {
  async normalize(rawReviews) {
    logger.info('Starting data normalization', { count: rawReviews.length });
    
    const normalized = normalizeApifyReviews(rawReviews, config.LOCATION_ID);
    const valid = normalized.filter(review => this.isValid(review));
    
    logger.info('Normalization completed', { 
      input: rawReviews.length,
      normalized: normalized.length,
      valid: valid.length,
      invalid: normalized.length - valid.length
    });
    
    return valid;
  }
  
  async deduplicate(normalizedReviews) {
    const reviewIds = normalizedReviews.map(r => r.review_id);
    const existing = await storage.getExistingReviews(reviewIds);
    const existingMap = new Map(existing.map(r => [r.review_id, r]));
    
    const newReviews = [];
    const updatedReviews = [];
    
    for (const review of normalizedReviews) {
      const existingReview = existingMap.get(review.review_id);
      
      if (!existingReview) {
        newReviews.push(review);
      } else if (this.hasChanged(review, existingReview)) {
        updatedReviews.push(review);
      }
      // Se não mudou, ignora (não faz nada)
    }
    
    logger.info('Deduplication completed', {
      total: normalizedReviews.length,
      new: newReviews.length,
      updated: updatedReviews.length,
      unchanged: normalizedReviews.length - newReviews.length - updatedReviews.length
    });
    
    return { newReviews, updatedReviews };
  }
  
  isValid(review) {
    return review.review_id && 
           review.rating && 
           review.comment && 
           review.reviewer_name;
  }
  
  hasChanged(current, existing) {
    // Compara campos que podem mudar (response_text, etc.)
    return current.response_text !== existing.response_text ||
           current.comment !== existing.comment ||
           current.rating !== existing.rating;
  }
}
```

#### **5. Persistência Transacional**
```javascript
// src/storage/supabase-client.js
const { createClient } = require('@supabase/supabase-js');
const logger = require('../monitoring/logger');

class SupabaseStorage {
  constructor() {
    this.client = createClient(
      config.SUPABASE_URL,
      config.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  
  async persistReviews(newReviews, updatedReviews) {
    const client = this.client;
    
    try {
      // Inicia transação (via RPC se necessário)
      let inserted = 0;
      let updated = 0;
      
      // Insert novos reviews
      if (newReviews.length > 0) {
        const { data, error } = await client
          .from('reviews')
          .insert(newReviews);
          
        if (error) throw error;
        inserted = newReviews.length;
        
        // Insert em reviews_raw também
        const rawPayloads = newReviews.map(r => ({
          review_id: r.review_id,
          location_id: r.location_id,
          raw_payload: r.raw_payload,
          last_seen_at: new Date().toISOString()
        }));
        
        await client.from('reviews_raw').insert(rawPayloads);
      }
      
      // Update reviews existentes
      if (updatedReviews.length > 0) {
        for (const review of updatedReviews) {
          const { error } = await client
            .from('reviews')
            .update({
              ...review,
              last_seen_at: new Date().toISOString()
            })
            .eq('review_id', review.review_id);
            
          if (error) throw error;
        }
        
        updated = updatedReviews.length;
      }
      
      logger.info('Reviews persisted successfully', { inserted, updated });
      
      return { inserted, updated };
      
    } catch (error) {
      logger.error('Failed to persist reviews', { error: error.message });
      throw error;
    }
  }
  
  async updateLocationMetrics() {
    // Recalcula métricas da localização
    const { error } = await this.client.rpc('update_location_metrics', {
      location_id_param: config.LOCATION_ID
    });
    
    if (error) {
      logger.error('Failed to update location metrics', { error: error.message });
      throw error;
    }
    
    logger.info('Location metrics updated successfully');
  }
}
```

---

## 🎯 Critérios de Sucesso

### **Funcionais**
- ✅ Sistema executa automaticamente todos os dias às 6h BRT
- ✅ Coleta 100% das reviews disponíveis das últimas 24h
- ✅ Zero duplicatas na base de dados
- ✅ Todas as tabelas (reviews, reviews_raw, gbp_locations, collection_runs) atualizadas corretamente
- ✅ Logs estruturados para auditoria completa

### **Não-Funcionais**
- ✅ Tempo de execução < 5 minutos para 200 reviews
- ✅ Disponibilidade > 99% (falhas aceitáveis: 1 dia/mês)
- ✅ Retry automático resolve 90% das falhas temporárias
- ✅ Notificação de falhas em < 15 minutos
- ✅ Custo operacional < $10/mês (Railway)

### **Técnicos**
- ✅ Deploy via Git push com rollback automático
- ✅ Healthcheck respondendo em < 1 segundo
- ✅ Logs persistidos por 30 dias
- ✅ Métricas disponíveis via Railway dashboard
- ✅ Configuração via variáveis de ambiente

---

## 📅 Cronograma de Implementação

### **Sprint 1 (3 dias) - Infraestrutura Base**
- Setup Railway project + Dockerfile
- Configuração básica Express + healthcheck
- Cliente Supabase configurado
- Sistema de logs com Winston

### **Sprint 2 (3 dias) - Coletor Apify**
- Implementação ApifyCollector class
- Sistema de retry com backoff
- Normalização de dados (porte do código existente)
- Testes unitários básicos

### **Sprint 3 (2 dias) - Persistência e Deduplicação**
- SupabaseStorage class completa
- Lógica de deduplicação
- Transações para consistência
- Atualização de métricas

### **Sprint 4 (2 dias) - Scheduler e Monitoramento**
- Cron manager com timezone correto
- Dashboard de status
- Sistema de alertas/notificações
- Testes de integração

### **Sprint 5 (1 dia) - Deploy e Validação**
- Deploy em produção Railway
- Teste end-to-end com dados reais
- Monitoramento ativo
- Documentação final

---

## 🔒 Considerações de Segurança

- **API Keys**: Todas as chaves em variáveis de ambiente Railway
- **Supabase**: Service role key com permissões mínimas necessárias
- **Webhook**: Validação de origem se usar notificações externas
- **Logs**: Não registrar dados sensíveis (senhas, tokens completos)
- **Network**: HTTPS obrigatório para todas as comunicações

---

## 📊 Métricas e Monitoramento

### **Métricas de Negócio**
- Reviews coletadas por dia
- Taxa de reviews novas vs. atualizadas
- Tempo médio entre review no Google e persistência no sistema
- Cobertura temporal (% de reviews das últimas 24h capturadas)

### **Métricas Técnicas**
- Tempo de execução por coleta
- Taxa de sucesso do cron job
- Latência de resposta da Apify
- Utilização de recursos Railway (CPU, memória)

### **Alertas Configurados**
- 🚨 Falha de execução do cron job
- ⚠️ Tempo de execução > 10 minutos
- ⚠️ Zero reviews coletadas em execução
- 🚨 Falha de conexão Supabase por > 5 minutos

---

## 🚀 Evolução Futura

### **Fase 2: Multi-localização**
- Suporte para múltiplas localizações do Cartório
- Configuração dinâmica via interface web
- Otimização de chamadas Apify para múltiplos targets

### **Fase 3: Analytics Avançadas**
- Análise de sentimento automática
- Detecção de tendências em tempo real
- Alertas proativos para reviews negativas

### **Fase 4: Integração Omnichannel**
- Coleta de reviews de outras plataformas (Facebook, Instagram)
- Unificação de dados de múltiplas fontes
- Dashboard consolidado para todas as plataformas

---

Este PRD define uma arquitetura robusta, escalável e maintível que aproveita as melhores práticas de desenvolvimento Node.js e resolve definitivamente os problemas da abordagem atual com Edge Functions.
