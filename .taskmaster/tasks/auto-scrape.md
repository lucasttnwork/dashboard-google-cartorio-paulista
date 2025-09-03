# Sistema de Scraping Automático - Implementação Detalhada

## 🎯 **OBJETIVO**
Implementar sistema completo de coleta automática de avaliações do Google Business Profile do Cartório Paulista, executando a cada hora.

## 📋 **ESPECIFICAÇÕES TÉCNICAS**

### **Arquitetura do Sistema**

#### **1. Componentes Principais**
```
├── scraper/
│   ├── core/           # Lógica central do scraping
│   ├── gbp/           # Scripts específicos para GBP
│   ├── processors/    # Processamento de dados
│   ├── storage/       # Interface com Supabase
│   └── scheduler/     # Sistema de agendamento
├── config/            # Configurações
├── logs/             # Sistema de logging
└── monitoring/       # Dashboard de status
```

#### **2. Stack Tecnológico**
- **Runtime**: Node.js 20+
- **Scraping**: Playwright
- **Agendamento**: node-cron
- **Storage**: Supabase PostgreSQL
- **Logging**: Winston + logrotate
- **Monitoring**: Métricas customizadas

### **IMPLEMENTAÇÃO PASSO A PASSO**

#### **FASE 1: Setup e Configuração**

**1.1 Estrutura de Diretórios**
```bash
mkdir -p scraper/{core,gbp,processors,storage,scheduler}
mkdir -p config logs monitoring
```

**1.2 Dependências**
```json
{
  "dependencies": {
    "playwright": "^1.40.0",
    "node-cron": "^3.0.3",
    "winston": "^3.11.0",
    "@supabase/supabase-js": "^2.38.0",
    "dotenv": "^16.3.1"
  }
}
```

**1.3 Configurações**
```javascript
// config/scraper.js
module.exports = {
  gbp: {
    url: 'https://www.google.com/search?q=cartorio+paulista+recife&rlz=1C1GCEU_pt-BRBR973BR973&oq=cartorio+paulista+recife',
    selectors: {
      reviewContainer: '[data-review-id]',
      rating: '[aria-label*="estrelas"]',
      comment: '[data-review-text]',
      author: '[data-review-author]',
      date: '[data-review-date]'
    }
  },
  schedule: '0 * * * *', // A cada hora
  retry: {
    maxAttempts: 3,
    delayMs: 5000
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY
  }
}
```

#### **FASE 2: Core Scraping Engine**

**2.1 GBP Scraper Class**
```javascript
// scraper/gbp/scraper.js
const { chromium } = require('playwright');

class GBPScraper {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1920, height: 1080 });
  }

  async scrapeReviews() {
    try {
      await this.page.goto(this.config.gbp.url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Aguardar reviews carregarem
      await this.page.waitForSelector('[data-review-id]', {
        timeout: 10000
      });

      const reviews = await this.page.evaluate(() => {
        const reviewElements = document.querySelectorAll('[data-review-id]');
        return Array.from(reviewElements).map(el => ({
          id: el.getAttribute('data-review-id'),
          rating: parseInt(el.querySelector('[aria-label*="estrelas"]')?.getAttribute('aria-label')?.match(/\d+/)?.[0] || '0'),
          comment: el.querySelector('[data-review-text]')?.textContent?.trim() || '',
          author: el.querySelector('[data-review-author]')?.textContent?.trim() || '',
          date: el.querySelector('[data-review-date]')?.getAttribute('datetime') || new Date().toISOString()
        }));
      });

      return reviews;
    } catch (error) {
      console.error('Erro no scraping:', error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = GBPScraper;
```

**2.2 Data Processor**
```javascript
// scraper/processors/review-processor.js
const crypto = require('crypto');

class ReviewProcessor {
  constructor() {
    this.knownCollaborators = [
      'Ana Sophia', 'Karen Figueiredo', 'Letícia Andreza',
      'Pedro Santos', 'Maria Oliveira', 'Kaio Gomes'
    ];
  }

  generateReviewId(review) {
    const content = `${review.author}${review.comment}${review.date}`;
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  extractCollaboratorMentions(comment) {
    const mentions = [];
    const lowerComment = comment.toLowerCase();

    this.knownCollaborators.forEach(collaborator => {
      if (lowerComment.includes(collaborator.toLowerCase())) {
        mentions.push(collaborator);
      }
    });

    return mentions;
  }

  validateReview(review) {
    const errors = [];

    if (!review.rating || review.rating < 1 || review.rating > 5) {
      errors.push('Rating inválido');
    }

    if (!review.comment || review.comment.trim().length < 10) {
      errors.push('Comentário muito curto');
    }

    if (!review.author || review.author.trim().length < 2) {
      errors.push('Nome do autor inválido');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  processReviews(rawReviews) {
    return rawReviews.map(review => {
      const processedReview = {
        review_id: this.generateReviewId(review),
        rating: review.rating,
        comment: review.comment,
        reviewer_name: review.author,
        create_time: review.date,
        collection_source: 'google',
        collaborator_mentions: this.extractCollaboratorMentions(review.comment),
        processed_at: new Date().toISOString()
      };

      const validation = this.validateReview(processedReview);
      processedReview.is_valid = validation.isValid;
      processedReview.validation_errors = validation.errors;

      return processedReview;
    });
  }
}

module.exports = ReviewProcessor;
```

#### **FASE 3: Storage e Persistência**

**3.1 Supabase Storage**
```javascript
// scraper/storage/supabase-storage.js
const { createClient } = require('@supabase/supabase-js');

class SupabaseStorage {
  constructor(config) {
    this.supabase = createClient(config.supabase.url, config.supabase.key);
  }

  async saveReviews(reviews) {
    const results = {
      inserted: 0,
      duplicates: 0,
      errors: 0,
      errorDetails: []
    };

    for (const review of reviews) {
      try {
        // Verificar se review já existe
        const { data: existing } = await this.supabase
          .from('reviews')
          .select('review_id')
          .eq('review_id', review.review_id)
          .single();

        if (existing) {
          results.duplicates++;
          continue;
        }

        // Inserir nova review
        const { error } = await this.supabase
          .from('reviews')
          .insert(review);

        if (error) {
          results.errors++;
          results.errorDetails.push({
            review_id: review.review_id,
            error: error.message
          });
        } else {
          results.inserted++;
        }
      } catch (error) {
        results.errors++;
        results.errorDetails.push({
          review_id: review.review_id,
          error: error.message
        });
      }
    }

    return results;
  }

  async saveCollaboratorMentions(reviewId, mentions) {
    if (mentions.length === 0) return;

    const mentionRecords = mentions.map(collaborator => ({
      review_id: reviewId,
      collaborator_name: collaborator,
      detected_at: new Date().toISOString()
    }));

    const { error } = await this.supabase
      .from('collaborator_mentions')
      .insert(mentionRecords);

    if (error) {
      console.error('Erro ao salvar menções:', error);
    }
  }

  async getScrapingStats() {
    const { data, error } = await this.supabase
      .from('scraping_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Erro ao buscar stats:', error);
      return [];
    }

    return data;
  }
}

module.exports = SupabaseStorage;
```

#### **FASE 4: Scheduler e Monitoramento**

**4.1 Cron Scheduler**
```javascript
// scraper/scheduler/cron-scheduler.js
const cron = require('node-cron');
const GBPScraper = require('../gbp/scraper');
const ReviewProcessor = require('../processors/review-processor');
const SupabaseStorage = require('../storage/supabase-storage');
const winston = require('winston');

class CronScheduler {
  constructor(config) {
    this.config = config;
    this.scraper = new GBPScraper(config);
    this.processor = new ReviewProcessor();
    this.storage = new SupabaseStorage(config);
    this.logger = this.setupLogger();
    this.isRunning = false;
  }

  setupLogger() {
    return winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/scraping.log' }),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }

  async runScrapingJob() {
    if (this.isRunning) {
      this.logger.warn('Scraping job já está em execução, pulando...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.info('Iniciando job de scraping...');

      // Inicializar scraper
      await this.scraper.initialize();

      // Coletar reviews
      const rawReviews = await this.scraper.scrapeReviews();
      this.logger.info(`Encontradas ${rawReviews.length} reviews brutas`);

      // Processar dados
      const processedReviews = this.processor.processReviews(rawReviews);
      const validReviews = processedReviews.filter(r => r.is_valid);

      this.logger.info(`${validReviews.length} reviews válidas processadas`);

      // Salvar no Supabase
      const saveResults = await this.storage.saveReviews(validReviews);

      // Salvar menções de colaboradores
      for (const review of validReviews) {
        await this.storage.saveCollaboratorMentions(review.review_id, review.collaborator_mentions);
      }

      // Registrar execução
      const executionTime = Date.now() - startTime;
      await this.logExecution({
        timestamp: new Date().toISOString(),
        raw_reviews: rawReviews.length,
        processed_reviews: validReviews.length,
        saved_reviews: saveResults.inserted,
        duplicates: saveResults.duplicates,
        errors: saveResults.errors,
        execution_time_ms: executionTime,
        status: 'success'
      });

      this.logger.info(`Job concluído: ${saveResults.inserted} reviews salvas`);

    } catch (error) {
      this.logger.error('Erro no job de scraping:', error);

      await this.logExecution({
        timestamp: new Date().toISOString(),
        raw_reviews: 0,
        processed_reviews: 0,
        saved_reviews: 0,
        duplicates: 0,
        errors: 1,
        execution_time_ms: Date.now() - startTime,
        status: 'error',
        error_message: error.message
      });
    } finally {
      await this.scraper.close();
      this.isRunning = false;
    }
  }

  async logExecution(stats) {
    try {
      const { error } = await this.storage.supabase
        .from('scraping_runs')
        .insert(stats);

      if (error) {
        this.logger.error('Erro ao registrar execução:', error);
      }
    } catch (error) {
      this.logger.error('Erro ao salvar log de execução:', error);
    }
  }

  start() {
    this.logger.info('Iniciando scheduler de scraping...');

    // Executar imediatamente na inicialização
    this.runScrapingJob();

    // Agendar execução a cada hora
    cron.schedule(this.config.schedule, () => {
      this.runScrapingJob();
    });

    this.logger.info(`Scheduler configurado para executar: ${this.config.schedule}`);
  }

  stop() {
    this.logger.info('Parando scheduler...');
    cron.destroy();
  }
}

module.exports = CronScheduler;
```

#### **FASE 5: Sistema de Monitoramento**

**5.1 Dashboard de Status**
```javascript
// monitoring/dashboard.js
const express = require('express');
const SupabaseStorage = require('../scraper/storage/supabase-storage');

class MonitoringDashboard {
  constructor(config) {
    this.app = express();
    this.storage = new SupabaseStorage(config);
    this.port = process.env.MONITORING_PORT || 3001;
  }

  async getDashboardData() {
    const stats = await this.storage.getScrapingStats();
    const latestRun = stats[0];

    return {
      status: latestRun?.status || 'unknown',
      lastRun: latestRun?.timestamp || null,
      reviewsCollected: latestRun?.saved_reviews || 0,
      executionTime: latestRun?.execution_time_ms || 0,
      errorCount: latestRun?.errors || 0,
      recentRuns: stats.slice(0, 5)
    };
  }

  start() {
    this.app.use(express.json());

    this.app.get('/api/status', async (req, res) => {
      try {
        const data = await this.getDashboardData();
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    this.app.listen(this.port, () => {
      console.log(`Dashboard de monitoramento rodando na porta ${this.port}`);
    });
  }
}

module.exports = MonitoringDashboard;
```

#### **FASE 6: Script Principal**

**6.1 Main Script**
```javascript
// scraper/index.js
const config = require('../config/scraper');
const CronScheduler = require('./scheduler/cron-scheduler');
const MonitoringDashboard = require('../monitoring/dashboard');

async function main() {
  console.log('🚀 Iniciando sistema de scraping do Cartório Paulista...');

  try {
    // Inicializar scheduler
    const scheduler = new CronScheduler(config);
    scheduler.start();

    // Inicializar dashboard de monitoramento
    const dashboard = new MonitoringDashboard(config);
    dashboard.start();

    console.log('✅ Sistema de scraping iniciado com sucesso!');
    console.log('📊 Dashboard disponível em: http://localhost:3001');
    console.log('⏰ Próxima execução: próxima hora cheia');

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Encerrando sistema...');
      scheduler.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Erro ao iniciar sistema:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
```

### **CONFIGURAÇÃO DE PRODUÇÃO**

#### **1. Railway Setup**
```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Configurar Playwright
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Criar diretório de logs
RUN mkdir -p logs

EXPOSE 3001

CMD ["node", "scraper/index.js"]
```

#### **2. Environment Variables**
```bash
# .env.production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
MONITORING_PORT=3001
NODE_ENV=production
```

#### **3. Railway Configuration**
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node scraper/index.js",
    "healthcheckPath": "/health"
  }
}
```

### **MONITORAMENTO E ALERTAS**

#### **1. Métricas Principais**
- **Uptime**: Sistema funcionando 24/7
- **Taxa de Sucesso**: > 95% das execuções
- **Reviews Coletadas**: Média por execução
- **Tempo de Processamento**: < 5 minutos
- **Erros**: Alertas automáticos

#### **2. Alertas Configurados**
- Scraping falha por 3+ execuções consecutivas
- Menos de 5 reviews coletadas
- Tempo de processamento > 10 minutos
- Erros de conectividade com Supabase

### **TESTES E VALIDAÇÃO**

#### **1. Testes Unitários**
```javascript
// tests/scraper.test.js
const { expect } = require('chai');
const GBPScraper = require('../scraper/gbp/scraper');
const ReviewProcessor = require('../scraper/processors/review-processor');

describe('GBP Scraper', () => {
  it('deve extrair reviews corretamente', async () => {
    const scraper = new GBPScraper(config);
    await scraper.initialize();

    const reviews = await scraper.scrapeReviews();
    expect(reviews).to.be.an('array');
    expect(reviews.length).to.be.greaterThan(0);

    await scraper.close();
  });

  it('deve processar dados corretamente', () => {
    const processor = new ReviewProcessor();
    const mockReview = {
      id: 'test-123',
      rating: 5,
      comment: 'Excelente atendimento da Ana Sophia!',
      author: 'João Silva',
      date: '2025-01-09T10:00:00Z'
    };

    const processed = processor.processReviews([mockReview])[0];

    expect(processed.rating).to.equal(5);
    expect(processed.collaborator_mentions).to.include('Ana Sophia');
    expect(processed.is_valid).to.be.true;
  });
});
```

### **CHECKLIST DE IMPLEMENTAÇÃO**

#### **✅ Funcionalidades Core**
- [x] Setup Playwright + Node.js
- [x] Scraping básico do GBP
- [x] Processamento de dados
- [x] Deduping inteligente
- [x] Detecção de colaboradores
- [x] Armazenamento no Supabase
- [x] Agendamento automático
- [x] Sistema de monitoramento
- [x] Dashboard de status
- [x] Alertas automáticos

#### **🚀 Otimizações**
- [ ] Sistema de proxy rotation
- [ ] User agents variados
- [ ] Rate limiting inteligente
- [ ] Circuit breaker pattern
- [ ] Cache de requests
- [ ] Compressão de dados

#### **📊 Métricas de Qualidade**
- **Performance**: < 5 min por execução
- **Confiabilidade**: > 99% uptime
- **Precisão**: > 95% de dados válidos
- **Cobertura**: Todas as reviews recentes

---

**🎯 Status**: Sistema de scraping automático completamente especificado e pronto para implementação. A arquitetura garante escalabilidade, confiabilidade e facilidade de manutenção em produção na Railway.
