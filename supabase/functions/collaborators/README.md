# API de Colaboradores - Cartório Paulista

## 📋 Visão Geral

Esta API fornece endpoints REST para gerenciamento completo de colaboradores do sistema do Cartório Paulista, seguindo as melhores práticas de arquitetura e segurança.

## 🏗️ Arquitetura

### Padrões Implementados
- **Clean Architecture**: Separação clara entre camadas (Controller → Service → Repository)
- **SOLID Principles**: Injeção de dependência, responsabilidade única, etc.
- **DTOs com Zod**: Validação rigorosa de entrada e saída
- **Error Handling**: Tratamento consistente de erros com códigos HTTP adequados

### Estrutura de Arquivos
```
supabase/functions/collaborators/
├── index.ts              # Entry point da Edge Function
├── collaborator.ts       # Lógica de negócio (Service/Repository/Controller)
├── collaborator.test.ts  # Testes unitários
├── integration.test.ts   # Testes de integração
└── README.md            # Esta documentação
```

## 🚀 Endpoints da API

### Base URL
```
https://your-project.supabase.co/functions/v1/collaborators
```

### Autenticação
Todos os endpoints requerem autenticação via Bearer token no header `Authorization`.

### 1. Listar Colaboradores
```http
GET /collaborators
```

#### Query Parameters
- `page` (number, opcional): Página atual (default: 1)
- `pageSize` (number, opcional): Itens por página (default: 10, max: 100)
- `sort` (string, opcional): Ordenação no formato `field:asc|desc`
- `q` (string, opcional): Busca por nome completo, departamento ou cargo
- `department` (string, opcional): Filtrar por departamento
- `is_active` (boolean, opcional): Filtrar por status ativo/inativo

#### Exemplo de Request
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/collaborators?page=1&pageSize=20&sort=full_name:asc&q=Ana" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

#### Response
```json
{
  "data": [
    {
      "id": 1,
      "full_name": "Ana Sophia",
      "department": "E-notariado",
      "position": "Atendente",
      "is_active": true,
      "aliases": ["ana.sophia", "ana"],
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T10:00:00Z"
    }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 2. Obter Colaborador por ID
```http
GET /collaborators/{id}
```

#### Path Parameters
- `id` (number): ID do colaborador

#### Response
```json
{
  "data": {
    "id": 1,
    "full_name": "Ana Sophia",
    "department": "E-notariado",
    "position": "Atendente",
    "is_active": true,
    "aliases": [],
    "created_at": "2024-01-01T10:00:00Z",
    "updated_at": "2024-01-01T10:00:00Z"
  },
  "meta": {
    "timestamp": "2024-01-01T10:00:00Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### 3. Criar Colaborador
```http
POST /collaborators
```

#### Request Body
```json
{
  "full_name": "João Silva",
  "department": "TI",
  "position": "Desenvolvedor",
  "is_active": true,
  "aliases": ["joao.silva", "joao"]
}
```

#### Response
```json
{
  "data": {
    "id": 2,
    "full_name": "João Silva",
    "department": "TI",
    "position": "Desenvolvedor",
    "is_active": true,
    "aliases": ["joao.silva", "joao"],
    "created_at": "2024-01-01T10:00:00Z",
    "updated_at": "2024-01-01T10:00:00Z"
  },
  "meta": {
    "timestamp": "2024-01-01T10:00:00Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440001"
  }
}
```

### 4. Atualizar Colaborador
```http
PUT /collaborators/{id}
```

#### Path Parameters
- `id` (number): ID do colaborador

#### Request Body
```json
{
  "full_name": "João Silva Santos",
  "position": "Desenvolvedor Senior"
}
```

### 5. Remover Colaborador
```http
DELETE /collaborators/{id}
```

#### Path Parameters
- `id` (number): ID do colaborador

#### Response
```json
{
  "data": { "deleted": true },
  "meta": {
    "timestamp": "2024-01-01T10:00:00Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440002"
  }
}
```

### 6. Estatísticas de Colaboradores
```http
GET /collaborators/stats
```

#### Response
```json
{
  "data": {
    "total_collaborators": 25,
    "active_collaborators": 22,
    "inactive_collaborators": 3,
    "top_department": "E-notariado"
  },
  "meta": {
    "timestamp": "2024-01-01T10:00:00Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440003"
  }
}
```

## 📊 Validações e Regras de Negócio

### Validações de Campo
- **full_name**: 1-100 caracteres, obrigatório
- **department**: 1-50 caracteres, opcional
- **position**: 1-50 caracteres, opcional
- **is_active**: boolean, default true
- **aliases**: array de strings, default []

### Regras de Negócio
1. **Nome único**: Não é possível criar colaboradores com o mesmo nome completo
2. **Proteção contra exclusão**: Colaboradores com menções em avaliações não podem ser removidos
3. **Atualização segura**: Validação de duplicatas ao atualizar nomes

## ⚠️ Tratamento de Erros

### Códigos de Status HTTP
- `200`: Sucesso
- `201`: Criado com sucesso
- `400`: Dados inválidos (validação Zod)
- `404`: Recurso não encontrado
- `409`: Conflito (nome duplicado, tentativa de exclusão com dependências)
- `500`: Erro interno do servidor

### Estrutura de Erro
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data"
  },
  "meta": {
    "timestamp": "2024-01-01T10:00:00Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

## 🧪 Testes

### Executar Testes Unitários
```bash
deno test supabase/functions/collaborators/collaborator.test.ts --allow-net
```

### Executar Testes de Integração
```bash
# Primeiro, inicie o Supabase local
supabase start

# Execute os testes
deno test supabase/functions/collaborators/integration.test.ts --allow-net
```

## 🗄️ Schema do Banco de Dados

### Tabela: `collaborators`
```sql
CREATE TABLE collaborators (
  id bigserial PRIMARY KEY,
  full_name text NOT NULL,
  department text,
  position text,
  is_active boolean DEFAULT true,
  aliases text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_collaborators_full_name_trgm ON collaborators USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_collaborators_department ON collaborators(department);
CREATE INDEX idx_collaborators_is_active ON collaborators(is_active);

-- RLS (Row Level Security)
ALTER TABLE collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to collaborators" ON collaborators FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow write access to collaborators" ON collaborators FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
```

### Função: `get_collaborators_stats()`
```sql
CREATE OR REPLACE FUNCTION get_collaborators_stats()
RETURNS table (
  total_collaborators bigint,
  active_collaborators bigint,
  inactive_collaborators bigint,
  top_department text
) LANGUAGE sql AS $$
  SELECT
    count(*) as total_collaborators,
    count(case when is_active then 1 end) as active_collaborators,
    count(case when not is_active then 1 end) as inactive_collaborators,
    (SELECT department
     FROM collaborators
     WHERE department IS NOT NULL
     GROUP BY department
     ORDER BY count(*) DESC
     LIMIT 1) as top_department
  FROM collaborators;
$$;
```

## 📈 Monitoramento e Observabilidade

### Logs Estruturados
Todos os requests são logados com:
- Timestamp
- Método HTTP e URL
- Status da resposta
- Tempo de execução
- Request ID para rastreamento

### Métricas
- Latência por endpoint
- Taxa de erro por endpoint
- Contagem de requests por hora

## 🚀 Deploy

### Deploy para Produção
```bash
# Deploy da Edge Function
supabase functions deploy collaborators

# Aplicar migrações do banco
supabase db push
```

### Variáveis de Ambiente
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 🔒 Segurança

- **Validação rigorosa**: Todos os inputs são validados com Zod
- **RLS habilitado**: Controle de acesso baseado em roles
- **Logs seguros**: Dados sensíveis não são logados
- **Rate limiting**: Implementado no nível do Supabase
- **CORS configurado**: Apenas origens autorizadas

## 📝 Próximos Passos

1. **Paginação por cursor**: Para datasets muito grandes
2. **Cache Redis**: Para melhorar performance de leitura
3. **Webhooks**: Notificações em tempo real para mudanças
4. **Auditoria**: Log detalhado de todas as operações
5. **Bulk operations**: Operações em lote para múltiplos colaboradores
