# PROMPT PARA NOVO CHAT - SISTEMA DE COLETA DE DADOS GOOGLE REVIEWS VIA DATAFORSEO

## CONTEXTO DO PROJETO
Estou desenvolvendo um sistema de coleta de dados de Google Reviews para "Cartório Paulista" (site oficial: cartoriopaulista.com.br) utilizando DataForSEO API e Supabase. O objetivo é coletar reviews automaticamente e armazená-los para posterior análise em dashboards e relatórios.

## INFRAESTRUTURA EXISTENTE
- **Supabase Project ID**: `bugpetfkyoraidyxmzxu`
- **URL**: `https://kdlvebimzmwsyfcrevng.supabase.co`
- **Edge Functions já deployadas**: `gbp-webhook`, `gbp-backfill`, `classifier`, `alerts`
- **Schema do banco**: Tabelas `gbp_locations`, `reviews`, `reviews_raw`, `nlp_queue` já criadas

## CREDENCIAIS DISPONÍVEIS
```
DATAFORSEO_LOGIN=ia@cartoriopaulista.com.br
DATAFORSEO_PASSWORD=fa6bd18c250f9692
DATAFORSEO_AUTH_B64=aWFAY2FydG9yaW9wYXVsaXN0YS5jb20uYnI6ZmE2YmQxOGMyNTBmOTY5Mg==

SUPABASE_URL=https://kdlvebimzmwsyfcrevng.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbHZlYmltem13c3lmY3Jldm5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTUwMjcsImV4cCI6MjA3MDg3MTAyN30.jW2l6fDmiZYbv9i964klds2fDo-7rOvPj0y43fXdh-Y
```

## PROBLEMAS IDENTIFICADOS E SOLUÇÕES NECESSÁRIAS

### 1. **PROBLEMA DE LOOKUP - Função retornando 500 e items vazios**
- **Sintoma**: `dataforseo-lookup` retorna erro 500 e `{"items":[],"best":null}`
- **Causas identificadas**:
  - Termos de busca não específicos o suficiente
  - Falta de fallbacks robustos para diferentes APIs DataForSEO
  - Tratamento de erro opaco (não propaga detalhes do erro DataForSEO)
- **Solução necessária**: Implementar estratégia de lookup com múltiplas vias e logs detalhados

### 2. **PROBLEMA DE INGESTÃO - Processed: 0**
- **Sintoma**: `dataforseo-reviews` cria task mas retorna 0 reviews processados
- **Causa**: Não aguarda `tasks_ready` antes de fazer `task_get`
- **Solução**: Implementar polling com backoff para aguardar conclusão da task

### 3. **PROBLEMAS DE DEPLOY E AUTENTICAÇÃO**
- **Sintoma**: Módulos `_shared` não encontrados, erros 401
- **Causas**: Falta de empacotamento correto das funções, autenticação JWT ativa
- **Soluções**: Replicar `_shared` em cada função, configurar secrets corretamente

## FUNÇÕES A SEREM IMPLEMENTADAS/MELHORADAS

### **dataforseo-lookup** (Edge Function)
- **Objetivo**: Encontrar identificador único do Cartório Paulista no Google
- **Estratégia de lookup**:
  1. Local Finder Live Advanced (termos: "Cartório Paulista São Paulo", "2º Tabelião de Notas São Paulo")
  2. Maps Live Advanced (fallback)
  3. Business Listings Search Live (fallback)
  4. Se falhar, usar Google Places API para obter `place_id`
- **Retorno esperado**: `place_id`, `cid`, ou `keyword` válido para identificação

### **dataforseo-reviews** (Edge Function)
- **Objetivo**: Coletar reviews via DataForSEO e armazenar no Supabase
- **Fluxo**: `task_post` → aguardar `tasks_ready` → `task_get` → normalizar e inserir
- **Armazenamento**: Tabelas `reviews` (normalizada) e `reviews_raw` (payload completo)

## TAREFAS PRIORITÁRIAS PARA EXECUTAR

### **FASE 1: Configuração e Correção**
1. **Configurar Secrets no projeto Supabase**:
   - `DATAFORSEO_AUTH_B64`
   - `SUPABASE_URL` 
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **Corrigir e redeployar Edge Functions**:
   - Replicar módulos `_shared` em cada função
   - Instrumentar logs detalhados de erro
   - Implementar fallbacks robustos no lookup

### **FASE 2: Implementação do Lookup Robusto**
3. **Implementar estratégia de lookup com múltiplas vias**:
   - Testar diferentes keywords e location_names
   - Implementar fallbacks automáticos
   - Logs detalhados de cada tentativa

4. **Integrar Google Places API como fallback final**:
   - Se DataForSEO falhar, usar Places API para obter `place_id`
   - Garantir identificação única do estabelecimento

### **FASE 3: Correção da Ingestão**
5. **Implementar polling robusto em dataforseo-reviews**:
   - Aguardar `tasks_ready` com backoff exponencial
   - Tratamento de erros e retry automático
   - Logs de debug para troubleshooting

### **FASE 4: Testes e Validação**
6. **Testar pipeline completo**:
   - Lookup retorna identificador válido
   - Ingestão processa reviews corretamente
   - Dados são armazenados no Supabase

7. **Implementar agendamento automático**:
   - Coleta incremental de novos reviews
   - Processamento NLP automático

## ARQUIVOS E ESTRUTURA EXISTENTE
- **Schema SQL**: `supabase/sql/init.sql` (tabelas já criadas)
- **Edge Functions**: Estrutura básica implementada
- **Módulos compartilhados**: `_shared/db.ts`, `_shared/dataforseo.ts`

## RESULTADO ESPERADO
Sistema funcional que:
- Identifica automaticamente o Cartório Paulista no Google
- Coleta reviews periodicamente via DataForSEO
- Armazena dados normalizados no Supabase
- Permite consultas para dashboards e relatórios
- Funciona de forma automatizada e confiável

## INSTRUÇÕES PARA O NOVO CHAT
1. **Analise o contexto completo** fornecido
2. **Identifique o estado atual** das implementações
3. **Execute as tarefas na ordem de prioridade** estabelecida
4. **Teste cada componente** antes de prosseguir
5. **Documente soluções** e comandos de teste
6. **Garanta que o sistema funcione end-to-end**

**IMPORTANTE**: Este é um sistema de produção que precisa funcionar de forma confiável. Cada etapa deve ser validada antes de prosseguir para a próxima.

---

## INFORMAÇÕES TÉCNICAS ADICIONAIS

### Stack Tecnológica
- **Backend**: Supabase Edge Functions (Deno)
- **Banco de Dados**: PostgreSQL (Supabase)
- **APIs**: DataForSEO, Google Business Profile, Google Places
- **Autenticação**: Supabase JWT, OAuth Google
- **Processamento**: NLP para classificação de sentimentos

### Estrutura do Banco
- `gbp_locations`: Localizações do Google Business Profile
- `reviews`: Reviews normalizados e processados
- `reviews_raw`: Payload completo dos reviews (backup)
- `nlp_queue`: Fila para processamento NLP

### Endpoints Principais
- `/dataforseo-lookup`: Identificação do estabelecimento
- `/dataforseo-reviews`: Coleta de reviews
- `/gbp-webhook`: Webhook para notificações em tempo real
- `/gbp-backfill`: Preenchimento histórico
- `/classifier`: Processamento NLP
- `/alerts`: Sistema de alertas
