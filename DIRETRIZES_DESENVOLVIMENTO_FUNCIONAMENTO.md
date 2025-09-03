# 📋 DIRETRIZES DE DESENVOLVIMENTO E FUNCIONAMENTO
## Dashboard Google - Cartório Paulista

---

## 🎯 **VISÃO GERAL DO PROJETO**

Este projeto implementa um dashboard completo para monitoramento de reviews do **Cartório Paulista** utilizando integração com DataForSEO API e Supabase como backend. O sistema coleta, processa e visualiza reviews do Google Business Profile de forma automatizada.

### **Status Atual: ✅ 95% FUNCIONAL**
- 🟢 **Backend Supabase**: Configurado e operacional
- 🟢 **API DataForSEO**: Totalmente funcional 
- 🟢 **Edge Functions**: Deployadas e testadas
- 🟢 **Dados do Cartório**: Coletados e organizados
- 🟡 **Dashboard Web**: Pronto para implementação

---

## 🏢 **DADOS DO CARTÓRIO PAULISTA**

### **Informações Principais**
- **Nome**: Cartório Paulista - 2º Cartório de Notas de São Paulo
- **Rating**: ⭐ 4.8/5 (8.537 avaliações)
- **Endereço**: Av. Paulista, 1776 - Bela Vista, São Paulo - SP, 01310-200
- **Telefone**: +55113357-8844
- **Website**: https://cartoriopaulista.com.br/

### **Identificadores API (CRÍTICOS PARA DESENVOLVIMENTO)**
```json
{
  "place_id": "ChIJPXbxB0ZYzpQR-6-w9dl9lSI",
  "cid": "2492036343902810107", 
  "feature_id": "0x94ce584607f1763d:0x22957dd9f5b0affb",
  "latitude": -23.5601417,
  "longitude": -46.657
}
```

### **Análise de Reputação**
- ✅ **Excelente**: 93.2% das avaliações são 5 estrelas
- ✅ **Alta satisfação**: Apenas 2.4% de avaliações negativas
- ✅ **Alto engajamento**: 8.537 avaliações totais
- ⚠️ **Monitorar**: 204 avaliações 1 estrela requerem atenção

### **Arquivo de Dados Local**
Todos os dados estão salvos em: `cartorio-paulista-dados.json`

---

## 🔧 **ARQUITETURA TÉCNICA**

### **Backend - Supabase**
- **URL**: https://bugpetfkyoraidyxmzxu.supabase.co
- **Projeto ID**: bugpetfkyoraidyxmzxu
- **Edge Functions**: dataforseo-lookup (ativa)

### **API DataForSEO**
- **Base URL**: https://api.dataforseo.com/v3
- **Autenticação**: Basic Auth (Base64)
- **Credenciais**: Configuradas em `.env`

### **Endpoints Funcionais**
```
✅ POST /functions/v1/dataforseo-lookup
   - action: 'search_business' 
   - action: 'get_reviews'
```

### **Estrutura do Banco de Dados**
```sql
-- Tabelas principais
reviews              -- Reviews normalizados
reviews_raw          -- Dados brutos da API
gbp_locations        -- Localizações do Google Business
alerts               -- Sistema de alertas
```

---

## 🔑 **CONFIGURAÇÃO DE DESENVOLVIMENTO**

### **Variáveis de Ambiente (.env)**
```env
# Supabase
SUPABASE_URL=https://bugpetfkyoraidyxmzxu.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# DataForSEO  
DATAFORSEO_AUTH_B64=aWFAY2FydG9yaW9wYXVsaXN0YS5jb20uYnI6ZmE2YmQxOGMyNTBmOTY5Mg==
```

### **Credenciais DataForSEO Decodificadas**
```
Login: ia@cartoriopaulista.com.br
Password: fa6bd18c250f9692
```

### **Dependências Principais**
```json
{
  "axios": "^1.7.7",
  "@supabase/supabase-js": "^2.45.4"
}
```

---

## 🚀 **FUNCIONALIDADES IMPLEMENTADAS**

### **1. Coleta de Dados ✅**
- ✅ Busca de cartórios por keyword
- ✅ Obtenção de informações detalhadas
- ✅ Coleta de distribuição de ratings
- ✅ Extração de dados de contato

### **2. Edge Functions ✅**
- ✅ `dataforseo-lookup` deployada e funcional
- ✅ Endpoints para busca e reviews
- ✅ Tratamento de erros robusto
- ✅ CORS configurado

### **3. Processamento de Dados ✅**
- ✅ Normalização de informações
- ✅ Validação de identificadores API
- ✅ Estruturação em JSON organizado
- ✅ Métricas de reputação calculadas

---

## 🧪 **TESTES E VALIDAÇÃO**

### **Scripts de Teste Disponíveis**
```bash
# Teste da API DataForSEO
node test-dataforseo.js

# Teste das Edge Functions (via PowerShell)
$headers = @{'Authorization' = 'Bearer [ANON_KEY]'}
Invoke-WebRequest -Uri "[EDGE_FUNCTION_URL]" -Headers $headers
```

### **Endpoints Testados ✅**
- ✅ `serp/google/local_finder/live/advanced`
- ✅ `serp/google/maps/live/advanced`
- ✅ Edge Function GET (status)
- ✅ Edge Function POST (search_business)
- ✅ Edge Function POST (get_reviews)

---

## 💡 **PRÓXIMOS PASSOS RECOMENDADOS**

### **Prioridade ALTA** 🔴
1. **Dashboard Web Interface**
   - Criar interface React/Next.js
   - Componentes para visualização de métricas
   - Gráficos de distribuição de ratings
   - Timeline de reviews

2. **Sistema de Coleta Automática**
   - Cron jobs para coleta periódica
   - Armazenamento de reviews individuais
   - Detecção de novos reviews

### **Prioridade MÉDIA** 🟡  
3. **Sistema de Alertas**
   - Notificações para reviews negativos
   - Alerts de mudança de rating
   - Monitoramento de tendências

4. **Analytics Avançado**
   - Análise de sentimento dos reviews
   - Identificação de temas recorrentes
   - Relatórios gerenciais

### **Prioridade BAIXA** 🟢
5. **Integrações Adicionais**
   - Webhooks em tempo real
   - API para terceiros
   - Backup automático

---

## 📊 **MÉTRICAS DE MONITORAMENTO**

### **KPIs Principais**
- **Rating Médio**: 4.8/5 ⭐
- **Volume de Reviews**: 8.537 total
- **Taxa de Satisfação**: 96.4% (4-5 estrelas)
- **Taxa de Insatisfação**: 2.4% (1 estrela)

### **Alertas Configurar**
- Novo review 1-2 estrelas
- Queda no rating médio
- Volume anormal de reviews
- Mudança nos dados de contato

---

## 🔒 **SEGURANÇA E BOAS PRÁTICAS**

### **Dados Sensíveis**
- ✅ Credenciais em variáveis de ambiente
- ✅ Autenticação via tokens
- ✅ Logs de auditoria implementados

### **Rate Limiting**
- DataForSEO: Respeitados limites da API
- Supabase: Utilizados rate limits padrão

### **Backup e Recuperação**
- Dados críticos em `cartorio-paulista-dados.json`
- Estrutura do banco documentada
- Edge Functions versionadas

---

## 📞 **SUPORTE E MANUTENÇÃO**

### **Logs de Desenvolvimento**
- Arquivo: `LOGS_DESENVOLVIMENTO.md`
- Status em tempo real
- Histórico de alterações

### **Documentação Técnica**
- README.md - Visão geral
- STATUS_IMPLEMENTACAO.md - Progresso
- Este arquivo - Diretrizes completas

### **Contatos API**
- **DataForSEO**: Conta ativa com créditos
- **Supabase**: Projeto gratuito com limites adequados

---

**Última atualização**: 29/08/2025 22:15 BRT  
**Status**: ✅ SISTEMA FUNCIONAL - Pronto para próximas implementações  
**Próxima milestone**: Dashboard Web Interface