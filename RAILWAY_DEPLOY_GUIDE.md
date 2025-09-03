# 🚂 **GUIA COMPLETO - DEPLOY NA RAILWAY**
## Dashboard Cartório Paulista

---

## 📋 **VISÃO GERAL**

Este guia detalha o processo completo de deploy do Dashboard do Cartório Paulista na Railway, incluindo configuração de produção, variáveis de ambiente e monitoramento.

---

## 🔧 **PRÉ-REQUISITOS**

### **1. Conta e Projeto**
```bash
# Conta Railway criada e logada
railway login

# Projeto criado
railway init dashboard-cartorio-paulista
```

### **2. Supabase Configurado**
```sql
-- Tabelas principais já criadas
-- Row Level Security habilitado
-- Edge Functions configuradas
-- API keys geradas
```

---

## 📁 **ESTRUTURA DO PROJETO**

```
dashboard-frontend/
├── src/
│   ├── app/           # Next.js App Router
│   ├── components/    # Componentes React
│   ├── lib/          # Utilitários e configs
│   └── store/        # Estado global
├── scraper/          # Sistema de scraping
│   ├── core/
│   ├── gbp/
│   ├── processors/
│   ├── storage/
│   └── scheduler/
├── monitoring/       # Dashboard de status
├── config/          # Configurações
├── logs/            # Sistema de logging
├── Dockerfile       # Configuração Docker
├── railway.json     # Config Railway
├── package.json
└── .env.example
```

---

## 🐳 **DOCKERFILE OTIMIZADO**

```dockerfile
# Dockerfile.production
FROM node:20-alpine AS base

# Instalar dependências do sistema para Playwright
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    npm

# Configurar Playwright
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos de configuração
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production --no-audit --no-fund

# Copiar código fonte
COPY . .

# Criar diretórios necessários
RUN mkdir -p logs monitoring scraper/{core,gbp,processors,storage,scheduler}

# Build da aplicação Next.js
RUN npm run build

# Expor portas
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Comando de inicialização
CMD ["npm", "run", "start:production"]
```

---

## ⚙️ **CONFIGURAÇÃO RAILWAY**

### **1. railway.json**
```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "npm run start:production",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  },
  "environments": {
    "production": {
      "variables": {
        "NODE_ENV": "production",
        "NEXT_PUBLIC_APP_URL": "${{ RAILWAY_STATIC_URL }}",
        "SUPABASE_URL": "${{ SUPABASE_URL }}",
        "SUPABASE_ANON_KEY": "${{ SUPABASE_ANON_KEY }}",
        "SUPABASE_SERVICE_ROLE_KEY": "${{ SUPABASE_SERVICE_ROLE_KEY }}",
        "SCRAPING_ENABLED": "true",
        "MONITORING_PORT": "3001",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### **2. package.json Scripts**
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "start:production": "node server.js",
    "scraper": "node scraper/index.js",
    "monitoring": "node monitoring/dashboard.js"
  }
}
```

---

## 🔐 **VARIÁVEIS DE AMBIENTE**

### **Railway Environment Variables**
```bash
# Aplicação
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://dashboard-cartorio-paulista.railway.app

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Scraping
SCRAPING_ENABLED=true
SCRAPING_INTERVAL=3600000
GBP_URL=https://www.google.com/search?q=cartorio+paulista+recife

# Monitoring
MONITORING_PORT=3001
LOG_LEVEL=info

# Segurança
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=https://dashboard-cartorio-paulista.railway.app
```

---

## 🚀 **PROCESSO DE DEPLOY**

### **Passo 1: Configuração Inicial**
```bash
# Clonar repositório
git clone https://github.com/your-org/dashboard-cartorio-paulista.git
cd dashboard-cartorio-paulista

# Instalar dependências
npm install

# Configurar Railway CLI
npm install -g @railway/cli
railway login
```

### **Passo 2: Deploy**
```bash
# Conectar ao projeto Railway
railway link

# Configurar variáveis de ambiente
railway variables set NODE_ENV=production
railway variables set SUPABASE_URL=your-supabase-url
railway variables set SUPABASE_ANON_KEY=your-anon-key
# ... outras variáveis

# Fazer deploy
railway deploy
```

### **Passo 3: Verificação**
```bash
# Verificar status do deploy
railway status

# Ver logs
railway logs

# Verificar health check
curl https://your-app.railway.app/api/health
```

---

## 📊 **MONITORAMENTO E LOGS**

### **1. Logs do Aplicativo**
```bash
# Logs em tempo real
railway logs --follow

# Logs filtrados por serviço
railway logs --service scraper
railway logs --service web
```

### **2. Métricas de Performance**
```bash
# Uso de recursos
railway usage

# Status dos serviços
railway ps
```

### **3. Health Checks**
```javascript
// src/app/api/health/route.js
export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    scraping: {
      lastRun: await getLastScrapingRun(),
      status: await getScrapingStatus()
    }
  }

  return Response.json(health)
}
```

---

## 🔄 **CI/CD COM GITHUB ACTIONS**

### **.github/workflows/deploy.yml**
```yaml
name: Deploy to Railway

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test

      - name: Build application
        run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Railway
        run: |
          npm install -g @railway/cli
          railway login --token ${{ secrets.RAILWAY_TOKEN }}
          railway link --project ${{ secrets.RAILWAY_PROJECT_ID }}
          railway deploy
```

---

## 🛠️ **MANUTENÇÃO E MONITORAMENTO**

### **1. Backup Automático**
```javascript
// scripts/backup.js
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

async function createBackup() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Backup das tabelas principais
  const tables = ['reviews', 'collaborator_mentions', 'scraping_runs']

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')

    if (error) {
      console.error(`Erro no backup da tabela ${table}:`, error)
      continue
    }

    const filename = `backup_${table}_${new Date().toISOString().split('T')[0]}.json`
    fs.writeFileSync(`backups/${filename}`, JSON.stringify(data, null, 2))
  }
}

// Executar backup diário
createBackup()
```

### **2. Alertas Automáticos**
```javascript
// monitoring/alerts.js
const nodemailer = require('nodemailer')

class AlertSystem {
  constructor() {
    this.transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.ALERT_EMAIL,
        pass: process.env.ALERT_EMAIL_PASSWORD
      }
    })
  }

  async sendAlert(subject, message) {
    await this.transporter.sendMail({
      from: process.env.ALERT_EMAIL,
      to: process.env.ADMIN_EMAIL,
      subject: `🚨 ALERTA - ${subject}`,
      html: message
    })
  }

  async checkScrapingHealth() {
    // Verificar se o scraping rodou nas últimas 2 horas
    const lastRun = await getLastScrapingRun()
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

    if (lastRun < twoHoursAgo) {
      await this.sendAlert(
        'Scraping Falhou',
        `O sistema de scraping não executou desde ${lastRun.toISOString()}`
      )
    }
  }

  async checkErrorRate() {
    // Verificar taxa de erro das últimas 24 horas
    const errorRate = await getErrorRate24h()

    if (errorRate > 0.1) { // 10% de erro
      await this.sendAlert(
        'Alta Taxa de Erro',
        `Taxa de erro atual: ${(errorRate * 100).toFixed(1)}%`
      )
    }
  }
}
```

---

## 📈 **OTIMIZAÇÃO DE PERFORMANCE**

### **1. Configuração Next.js**
```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Otimizações de performance
  swcMinify: true,
  compress: true,

  // CDN e cache
  assetPrefix: process.env.NODE_ENV === 'production' ? process.env.NEXT_PUBLIC_CDN_URL : '',

  // Headers de segurança
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      }
    ]
  },

  // Otimizações de imagem
  images: {
    domains: ['images.unsplash.com', 'avatars.githubusercontent.com'],
    formats: ['image/webp', 'image/avif']
  },

  // Experimental features
  experimental: {
    optimizeCss: true,
    scrollRestoration: true
  }
}

module.exports = nextConfig
```

### **2. Cache Strategy**
```javascript
// src/lib/cache.js
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutos

class CacheManager {
  constructor() {
    this.cache = new Map()
  }

  get(key) {
    const item = this.cache.get(key)
    if (!item) return null

    if (Date.now() > item.expiry) {
      this.cache.delete(key)
      return null
    }

    return item.value
  }

  set(key, value, duration = CACHE_DURATION) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + duration
    })
  }

  clear() {
    this.cache.clear()
  }
}

export const cacheManager = new CacheManager()
```

---

## 🔒 **SEGURANÇA EM PRODUÇÃO**

### **1. Rate Limiting**
```javascript
// middleware.js
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const RATE_LIMIT = 100 // requests por minuto
const WINDOW_SIZE = 60 * 1000 // 1 minuto

const requests = new Map()

export function middleware(request: NextRequest) {
  const ip = request.ip || 'anonymous'
  const now = Date.now()

  // Limpar requests antigas
  for (const [key, timestamp] of requests.entries()) {
    if (now - timestamp > WINDOW_SIZE) {
      requests.delete(key)
    }
  }

  // Contar requests do IP
  const requestCount = Array.from(requests.values())
    .filter(timestamp => now - timestamp < WINDOW_SIZE)
    .filter(timestamp => requests.get(ip) === timestamp).length

  if (requestCount >= RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    )
  }

  requests.set(ip, now)

  return NextResponse.next()
}
```

### **2. Environment Security**
```bash
# .env.production
# Nunca commitar chaves reais
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT e autenticação
NEXTAUTH_SECRET=your-very-secure-secret-key
NEXTAUTH_URL=https://dashboard-cartorio-paulista.railway.app

# Scraping (com proxy se necessário)
SCRAPING_PROXY_URL=https://proxy-provider.com
SCRAPING_PROXY_KEY=your-proxy-key
```

---

## 📊 **MONITORAMENTO AVANÇADO**

### **1. Métricas Customizadas**
```javascript
// monitoring/metrics.js
const promClient = require('prom-client')

// Métricas do Prometheus
const register = new promClient.Registry()

const scrapingDuration = new promClient.Histogram({
  name: 'scraping_duration_seconds',
  help: 'Tempo de execução do scraping',
  buckets: [1, 5, 10, 30, 60, 120]
})

const reviewsCollected = new promClient.Counter({
  name: 'reviews_collected_total',
  help: 'Total de reviews coletadas'
})

const scrapingErrors = new promClient.Counter({
  name: 'scraping_errors_total',
  help: 'Total de erros no scraping'
})

register.registerMetric(scrapingDuration)
register.registerMetric(reviewsCollected)
register.registerMetric(scrapingErrors)

module.exports = {
  register,
  scrapingDuration,
  reviewsCollected,
  scrapingErrors
}
```

### **2. Dashboard de Status**
```javascript
// monitoring/status.js
const express = require('express')
const { register } = require('./metrics')

const app = express()

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})

app.get('/status', async (req, res) => {
  const status = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    scraping: await getScrapingStatus(),
    database: await getDatabaseStatus(),
    timestamp: new Date().toISOString()
  }

  res.json(status)
})

app.listen(9090, () => {
  console.log('Monitoring server running on port 9090')
})
```

---

## 🚨 **PROCEDIMENTOS DE EMERGÊNCIA**

### **1. Rollback**
```bash
# Rollback para versão anterior
railway rollback

# Verificar status
railway status

# Logs do rollback
railway logs --since 1h
```

### **2. Troubleshooting**
```bash
# Verificar variáveis de ambiente
railway variables list

# Restart do serviço
railway restart

# Verificar conectividade
railway run curl -f http://localhost:3000/api/health
```

### **3. Backup de Emergência**
```bash
# Backup manual do banco
railway run pg_dump $DATABASE_URL > backup.sql

# Download dos logs
railway logs --since 24h > emergency_logs.txt
```

---

## 📚 **DOCUMENTAÇÃO DE PRODUÇÃO**

### **1. Runbooks**
- **Deploy**: Procedimentos de deploy
- **Monitoring**: Como monitorar o sistema
- **Troubleshooting**: Solução de problemas comuns
- **Backup**: Procedimentos de backup e recuperação

### **2. Alertas e Escalation**
- **P0**: Sistema indisponível (>5min)
- **P1**: Funcionalidades críticas quebradas
- **P2**: Performance degradada
- **P3**: Problemas menores

### **3. Manutenção Programada**
- **Janelas de manutenção**: Todos os domingos 02:00-04:00
- **Notificação prévia**: 24h de antecedência
- **Procedimentos**: Backup + deploy + testes

---

## 🎯 **CHECKLIST DE DEPLOY**

### **Pré-Deploy**
- [ ] Supabase configurado e testado
- [ ] Variáveis de ambiente definidas
- [ ] Dockerfile testado localmente
- [ ] CI/CD pipeline configurado
- [ ] Domínio SSL configurado

### **Deploy**
- [ ] Railway project criado
- [ ] Código enviado para branch main
- [ ] Build executado com sucesso
- [ ] Health checks passando
- [ ] Scraping testado em produção

### **Pós-Deploy**
- [ ] Funcionalidades testadas
- [ ] Performance verificada
- [ ] Logs monitorados
- [ ] Alertas configurados
- [ ] Backup automático ativo

---

## 📞 **SUPORTE E CONTATO**

**Equipe Técnica**
- **Tech Lead**: Senior Frontend/UI Engineer
- **DevOps**: Railway + Supabase
- **Monitoring**: Alertas automáticos

**Canais de Comunicação**
- **Issues**: GitHub Issues
- **Chat**: Discord/Slack
- **Email**: alerts@cartorio-paulista.com

**Documentação Técnica**
- **API Docs**: `/api/docs`
- **Health Check**: `/api/health`
- **Metrics**: `/metrics`
- **Status Page**: `/status`

---

**🎯 CONCLUSÃO**
Este guia garante um deploy robusto, monitorado e escalável do Dashboard do Cartório Paulista na Railway, com foco em confiabilidade, performance e facilidade de manutenção.
