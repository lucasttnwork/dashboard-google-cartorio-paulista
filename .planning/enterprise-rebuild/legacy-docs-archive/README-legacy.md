# 🏛️ Dashboard Google - Cartório Paulista

Sistema completo de monitoramento e análise de avaliações do Google Business Profile para o Cartório Paulista, com coleta automática e dashboard analítico em tempo real.

## 📋 Visão Geral

Este projeto consiste em uma plataforma completa que automatiza a coleta de avaliações do Google Business Profile e apresenta insights analíticos através de um dashboard moderno e responsivo.

### 🎯 Funcionalidades Principais

- **🤖 Coleta Automática**: Scraper Playwright que executa a cada hora
- **📊 Dashboard Analítico**: Interface moderna com gráficos e KPIs
- **👥 Análise de Colaboradores**: Identificação automática de menções em avaliações
- **📈 Tendências Temporais**: Análise de evolução das avaliações ao longo do tempo
- **💾 Armazenamento Seguro**: Banco PostgreSQL com RLS via Supabase
- **🏥 Monitoramento**: Health checks e métricas em tempo real
- **🐳 Deploy Containerizado**: Docker + Railway para produção

## 🏗️ Arquitetura

```
Dashboard Google - Cartório Paulista/
├── dashboard-frontend/          # Next.js 15 + TypeScript + Tailwind
│   ├── src/
│   │   ├── app/                # App Router (Next.js 15)
│   │   ├── components/         # Componentes reutilizáveis
│   │   └── lib/               # Hooks, adapters, utils
│   └── Dockerfile             # Container para produção
│
├── scraper/                   # Worker de coleta automática
│   ├── gbp/                  # Scraping do Google Business Profile
│   ├── processors/           # Processamento e validação
│   ├── storage/             # Integração Supabase
│   ├── scheduler/           # Cron jobs
│   ├── monitoring/          # Dashboard de monitoramento
│   └── Dockerfile          # Container para produção
│
├── supabase/               # Schema e configurações do banco
│   ├── sql/
│   │   └── init.sql       # Schema completo + RPCs + dados exemplo
│   └── functions/         # Edge Functions (se necessário)
│
├── .github/workflows/     # CI/CD com GitHub Actions
└── docker-compose.yml    # Desenvolvimento local
```

## 🚀 Quick Start

### 1. Pré-requisitos

- **Node.js 18+**
- **Conta Supabase** (para banco PostgreSQL)
- **Conta Railway** (para deploy em produção)
- **Google Business Profile** configurado

### 2. Configuração do Banco de Dados

1. **Criar projeto no Supabase**
2. **Aplicar schema**:
   ```sql
   -- Execute o conteúdo de supabase/sql/init.sql no SQL Editor
   ```
3. **Obter credenciais**:
   - URL do projeto
   - Anon key (para frontend)
   - Service role key (para scraper)

### 3. Setup Local - Frontend

```bash
cd dashboard-frontend
npm install
cp .env.local.example .env.local
# Editar .env.local com suas credenciais Supabase
npm run dev
```

Acesse: http://localhost:3000

### 4. Setup Local - Scraper

```bash
cd scraper
npm install
npm run install-browsers  # Instala Chromium para Playwright
cp .env.example .env
# Editar .env com suas credenciais
npm start
```

Dashboard de monitoramento: http://localhost:3001

### 5. Docker (Recomendado)

```bash
# Copiar .env.example para .env e configurar
cp .env.example .env

# Subir todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f
```

## 🔧 Configuração

### Variáveis de Ambiente

#### Frontend (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
```

#### Scraper (.env)
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
GBP_SEARCH_URL=https://www.google.com/maps/place/Cartório+Paulista
CRON_SCHEDULE=0 */1 * * *  # A cada hora
PORT=3001
LOG_LEVEL=info
```

### Configuração do Google Business Profile

1. **Encontrar URL do Google Maps** da sua empresa
2. **Configurar GBP_SEARCH_URL** no scraper
3. **Testar scraping**: `cd scraper && npm test`

## 🚀 Deploy em Produção

### Railway (Recomendado)

1. **Conectar repositório** ao Railway
2. **Criar dois serviços**:
   - **Frontend**: Detecta automaticamente `dashboard-frontend/`
   - **Scraper**: Detecta automaticamente `scraper/`

3. **Configurar variáveis de ambiente** em cada serviço
4. **Deploy automático** via GitHub Actions

### Manual com Docker

```bash
# Build das imagens
docker build -t cartorio-frontend ./dashboard-frontend
docker build -t cartorio-scraper ./scraper

# Deploy com docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

## 📊 Monitoramento

### Frontend
- **Health Check**: `GET /api/health`
- **Dashboard**: Interface principal com KPIs e gráficos

### Scraper
- **Dashboard**: http://localhost:3001
- **Health Check**: `GET /health`
- **Status API**: `GET /api/status`
- **Métricas**: `GET /api/metrics`
- **Trigger Manual**: `POST /api/trigger`

### Logs
- **Frontend**: Next.js logs
- **Scraper**: `logs/scraper.log`, `logs/error.log`

## 🔄 CI/CD

O projeto inclui pipelines automatizados com GitHub Actions:

- **Lint e Build** em PRs e pushes
- **Testes de Segurança** com npm audit
- **Deploy Automático** para Railway no branch `main`
- **Health Checks** pós-deploy

### Secrets Necessários

```
RAILWAY_TOKEN=seu-token-railway
NEXT_PUBLIC_SUPABASE_URL=url-supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
SUPABASE_URL=url-supabase
SUPABASE_SERVICE_ROLE_KEY=service-role-key
GBP_SEARCH_URL=url-google-maps
FRONTEND_URL=https://seu-frontend.railway.app
SCRAPER_URL=https://seu-scraper.railway.app
```

## 📈 Funcionalidades Implementadas

### ✅ Dashboard Frontend
- **KPIs em Tempo Real**: Total de avaliações, rating médio, % 5 estrelas
- **Gráficos Interativos**: Evolução temporal com Recharts
- **Tabela de Avaliações**: Filtros avançados, busca, export CSV
- **Ranking de Colaboradores**: Menções automáticas em avaliações
- **Design Responsivo**: Mobile-first com Tailwind CSS
- **Temas**: Light/Dark mode automático

### ✅ Sistema de Scraping
- **Coleta Automática**: Cron job configurável (padrão: hora em hora)
- **Navegador Headless**: Playwright com Chromium
- **Processamento Inteligente**: Deduplicação SHA-256
- **Análise NLP**: Detecção automática de menções a colaboradores
- **Armazenamento Seguro**: PostgreSQL com RLS

### ✅ Banco de Dados
- **Schema Completo**: Tabelas otimizadas com índices
- **RPCs Personalizadas**: Funções para estatísticas e tendências
- **Row Level Security**: Políticas de acesso configuradas
- **Dados de Exemplo**: 10 reviews e 9 colaboradores para teste

### ✅ Infraestrutura
- **Containerização**: Dockerfiles otimizados para produção
- **Health Checks**: Monitoramento de saúde dos serviços
- **Logging Estruturado**: Winston com níveis configuráveis
- **Graceful Shutdown**: Limpeza adequada de recursos

## 🛠️ Desenvolvimento

### Estrutura de Dados

#### Reviews
```sql
CREATE TABLE reviews (
  review_id TEXT PRIMARY KEY,
  location_id TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  reviewer_name TEXT,
  create_time TIMESTAMPTZ,
  -- ... outros campos
);
```

#### Colaboradores
```sql
CREATE TABLE collaborators (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  department TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  aliases TEXT[] DEFAULT '{}'::TEXT[]
);
```

### APIs Principais

#### Frontend
- `GET /api/health` - Health check

#### Scraper
- `GET /health` - Health check
- `GET /api/status` - Status do scraper
- `GET /api/metrics` - Métricas detalhadas
- `POST /api/trigger` - Executar scraping manual
- `POST /api/scheduler/pause` - Pausar agendamento
- `POST /api/scheduler/resume` - Retomar agendamento

### Comandos Úteis

```bash
# Frontend
cd dashboard-frontend
npm run dev          # Desenvolvimento
npm run build        # Build produção
npm run lint         # Lint código

# Scraper
cd scraper
npm start           # Iniciar aplicação
npm test            # Teste de scraping
node index.js health # Check saúde do sistema
node index.js config # Ver configuração atual

# Docker
docker-compose up -d              # Subir serviços
docker-compose logs -f scraper    # Ver logs do scraper
docker-compose down               # Parar serviços
```

## 📦 Padronização Apify (Passo-a-passo)

1. Aplicar migração idempotente:
   - Execute `supabase/sql/2025-09-17_apify_standardization.sql` no SQL Editor do Supabase.

2. Canonicalizar location e limpar legado:
```bash
node scripts/cleanup_legacy_and_canonicalize.js "dataset_Google-Maps-Reviews-Scraper_2025-09-17_12-03-32-701 (1).json"
```

3. Importar dataset Apify (preenche todas as colunas e reviews_raw):
```bash
node import_apify_dataset_to_supabase.js "dataset_Google-Maps-Reviews-Scraper_2025-09-17_12-03-32-701 (1).json"
```

4. Validações rápidas:
```sql
select count(*) from reviews
where location_id='cartorio-paulista-location' and source='apify'
  and create_time >= '2025-09-01' and create_time < '2025-10-01';

select review_url, count(*) from reviews where review_url is not null group by 1 having count(*)>1;
```

## 🐛 Troubleshooting

### Problemas Comuns

1. **Scraper não encontra reviews**:
   - Verificar se `GBP_SEARCH_URL` está correto
   - Testar URL manualmente no navegador
   - Verificar logs: `docker-compose logs scraper`

2. **Frontend mostra dados mock**:
   - Verificar variáveis `NEXT_PUBLIC_SUPABASE_*`
   - Confirmar se RPCs foram aplicadas no Supabase
   - Ver console do navegador para erros

3. **Erro de conexão com banco**:
   - Verificar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
   - Testar: `cd scraper && node index.js health`
   - Confirmar se IP está na whitelist do Supabase

4. **Deploy Railway falha**:
   - Verificar se variáveis de ambiente estão configuradas
   - Conferir logs de build no Railway
   - Verificar health checks após deploy

### Logs e Debug

```bash
# Logs detalhados do scraper
LOG_LEVEL=debug node index.js start

# Logs do Docker
docker-compose logs -f --tail=100 scraper

# Health check manual
curl http://localhost:3001/health
curl http://localhost:3000/api/health
```

## 🤝 Contribuição

1. **Fork** o projeto
2. **Crie** uma branch: `git checkout -b feature/nova-funcionalidade`
3. **Commit** suas mudanças: `git commit -m 'Adiciona nova funcionalidade'`
4. **Push** para a branch: `git push origin feature/nova-funcionalidade`
5. **Abra** um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🆘 Suporte

- **Issues**: Use o GitHub Issues para reportar bugs
- **Documentação**: Consulte os READMEs específicos em cada diretório
- **Logs**: Sempre inclua logs relevantes ao reportar problemas

---

**🏛️ Cartório Paulista** - Sistema de Monitoramento de Avaliações
Desenvolvido com ❤️ usando Next.js, Playwright, Supabase e Railway.