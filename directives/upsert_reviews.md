# SOP: Upsert de Reviews do Google Maps para Supabase

## Objetivo
Sincronizar reviews coletados do Google Maps (via Apify Scraper) com o banco de dados Supabase, aplicando deduplicação e normalização de dados.

## Quando usar
- Após cada execução do scraper do Apify
- Quando houver novos datasets de reviews no diretório raiz
- Para sincronização manual de dados históricos

## Pré-requisitos

### Variáveis de ambiente (`.env`)
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
REVIEW_BATCH_SIZE=250                    # Opcional, padrão: 250
GBP_LOCATION_ID=cartorio-paulista-location
GBP_ACCOUNT_ID=cartorio-paulista
GBP_ACCOUNT_NAME=Cartório Paulista
```

### Dependências
- Node.js instalado
- Pacotes: `@supabase/supabase-js` (instalado via `npm install`)

## Input
- **Arquivo**: Dataset do Apify em formato CSV ou JSON
- **Localização**: Diretório raiz do projeto
- **Padrão de nome**: `dataset_Google-Maps-Reviews-Scraper_YYYY-MM-DD_HH-MM-SS-MS.{csv|json}`

### Estrutura esperada do CSV/JSON
Campos principais do scraper Apify:
- `reviewId` - ID único do review
- `text` - Comentário do cliente
- `stars` ou `rating` - Nota (1-5)
- `name` - Nome do avaliador
- `publishedAtDate` - Data de publicação
- `responseFromOwnerText` - Resposta do proprietário
- `responseFromOwnerDate` - Data da resposta
- `placeId` - ID do local no Google
- `cid` - Company ID
- `title` - Nome do estabelecimento
- `address`, `phone`, `url` - Dados do local

## Output
- Registros inseridos/atualizados em:
  - `reviews_raw` - Payload completo (backup/auditoria)
  - `reviews` - Dados normalizados (queries e análises)
- Console log com estatísticas de sincronização

## Processo (Layer 2 - Orchestration)

### 1. Preparar o dataset
Se o arquivo for CSV, converter para JSON primeiro:
```bash
node execution/convert-csv-to-json.js dataset_Google-Maps-Reviews-Scraper_YYYY-MM-DD.csv
```

Isso gerará: `dataset_Google-Maps-Reviews-Scraper_YYYY-MM-DD.json`

### 2. Executar o upsert
```bash
node scripts/upsert-google-reviews.js dataset_Google-Maps-Reviews-Scraper_YYYY-MM-DD.json
```

### 3. Verificar resultados
O script exibirá:
- Total de reviews únicos após deduplicação
- Progresso do upsert em batches
- Confirmação de conclusão sem duplicidades

### 4. (Opcional) Vincular menções de colaboradores
Após o upsert, executar o script de linkagem:
```bash
TARGET_MONTH=2026-01 node scripts/link-collaborator-mentions.js
```

## Fluxo de dados (Layer 3 - Execution)

```
Dataset CSV/JSON
    │
    ├─► Deduplicação local (review_id)
    │
    ├─► Normalização de campos
    │   - reviewId → review_id
    │   - stars/rating → rating (1-5)
    │   - text → comment
    │   - name → reviewer_name
    │   - publishedAtDate → create_time
    │
    ├─► Upsert em batches (default: 250)
    │   ├─► reviews_raw (payload completo)
    │   └─► reviews (campos normalizados)
    │
    └─► Trigger automático: TSV para busca full-text
```

## Scripts envolvidos (Layer 3)

### Script principal
- **`scripts/upsert-google-reviews.js`** - Script canônico de ingestão
  - Lê JSON
  - Aplica deduplicação
  - Faz upsert em `reviews_raw` e `reviews`
  - Usa `onConflict: 'review_id'` para idempotência

### Script auxiliar (converter CSV)
- **`execution/convert-csv-to-json.js`** - Converte CSV do Apify para JSON
  - Lê CSV com BOM UTF-8
  - Converte para array de objetos JSON
  - Salva arquivo `.json` no mesmo diretório

## Transformações aplicadas

### Mapeamento de campos
| Campo origem | Campo destino | Tipo |
|---|---|---|
| `reviewId`, `review_id`, `id` | `review_id` | TEXT (PK) |
| `stars`, `rating` | `rating` | INTEGER (1-5) |
| `text`, `review_text`, `comment` | `comment` | TEXT |
| `name`, `reviewer`, `reviewerName` | `reviewer_name` | TEXT |
| `publishedAtDate`, `publishedAt` | `create_time` | TIMESTAMPTZ |
| `responseFromOwnerText` | `reply_text` | TEXT |
| `responseFromOwnerDate` | `reply_time` | TIMESTAMPTZ |

### Validações
- Review sem `review_id` é descartado
- `is_anonymous` = `true` se `reviewer_name` for null
- Rating deve estar entre 1-5 (validação na database)

## Tabelas Supabase afetadas

### `gbp_accounts`
- Upsert do account (default: "cartorio-paulista")

### `gbp_locations`
- Upsert da location baseado em `place_id`
- Extrai `domain` do `url` se disponível

### `reviews_raw`
- Armazena payload JSON completo
- Chave: `review_id`
- Para auditoria e debugging

### `reviews`
- Armazena dados normalizados
- Chave: `review_id`
- Trigger automático: preenche `tsv` (full-text search)

## Edge cases e tratamentos

### Duplicatas
- **Local**: Deduplicação por `review_id` antes do upsert
- **Database**: `onConflict: 'review_id'` atualiza registro existente
- **Resultado**: Idempotente - pode rodar múltiplas vezes sem problemas

### Campos ausentes
- Script usa operador `??` para coalescer múltiplos nomes de campo
- Campos opcionais são `null` se não existirem
- Reviews sem `review_id` são ignorados silenciosamente

### CSV com BOM UTF-8
- O conversor trata automaticamente BOM (Byte Order Mark)
- Suporta quebras de linha dentro de campos entre aspas

### Batches grandes
- Batch size configurável via `REVIEW_BATCH_SIZE`
- Default: 250 registros por batch
- Previne timeouts e problemas de memória

## Monitoramento e validação

### Verificar sincronização
```sql
-- Contar reviews por mês
SELECT
  DATE_TRUNC('month', create_time) AS month,
  COUNT(*) AS total_reviews
FROM reviews
WHERE source = 'apify'
GROUP BY month
ORDER BY month DESC;

-- Verificar últimos reviews inseridos
SELECT review_id, reviewer_name, rating, create_time
FROM reviews
ORDER BY create_time DESC
LIMIT 10;
```

### Verificar payload raw
```sql
-- Inspecionar payload completo de um review específico
SELECT payload
FROM reviews_raw
WHERE review_id = 'REVIEW_ID_AQUI';
```

## Troubleshooting

### Erro: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
**Causa**: A tabela `reviews` não tem PRIMARY KEY configurado no banco de dados.

**Solução**: Execute o SQL abaixo no Supabase SQL Editor (Dashboard):
```sql
ALTER TABLE reviews ADD PRIMARY KEY (review_id);
```

Ou use o arquivo pré-criado: `supabase/sql/fix_reviews_pk.sql`

**Verificar se foi corrigido**:
```sql
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'reviews'::regclass;
```

### Erro: "Arquivo não encontrado"
- Verificar que o path do arquivo está correto
- Usar path relativo ou absoluto
- Exemplo: `node scripts/upsert-google-reviews.js ./dataset_2026-01-14.json`

### Erro: "SUPABASE_URL não definido"
- Verificar arquivo `.env` existe no diretório raiz
- Verificar variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão definidas

### Erro de permissão Supabase
- Usar `SUPABASE_SERVICE_ROLE_KEY` (não a chave anon)
- Service role key tem permissões administrativas

### CSV não reconhecido pelo script
- Converter CSV para JSON primeiro usando `execution/convert-csv-to-json.js`
- O script principal só aceita JSON

### Muitos registros (timeout)
- Reduzir `REVIEW_BATCH_SIZE` no `.env`
- Exemplo: `REVIEW_BATCH_SIZE=100`

## Próximos passos após upsert

1. **Vincular colaboradores mencionados**
   - Script: `scripts/link-collaborator-mentions.js`
   - Identifica nomes de colaboradores nos comentários

2. **Processamento NLP** (futuro)
   - Análise de sentimento
   - Classificação de toxicidade
   - Detecção de menções a e-notariado

3. **Dashboard atualizado**
   - Estatísticas refletem novos reviews automaticamente
   - Gráficos e métricas recalculados via RPCs

## Boas práticas

1. **Sempre fazer backup antes de grandes importações**
   ```sql
   -- Exportar reviews existentes
   COPY reviews TO '/tmp/reviews_backup.csv' WITH CSV HEADER;
   ```

2. **Testar com amostra pequena primeiro**
   - Usar subset do dataset para validar processo
   - Verificar mapeamento de campos está correto

3. **Manter histórico de datasets**
   - Não deletar arquivos CSV/JSON após importação
   - Útil para auditoria e re-importação se necessário

4. **Monitorar performance**
   - Importações grandes podem demorar minutos
   - Observar logs de progresso dos batches

5. **Atualizar esta diretiva quando aprender algo novo**
   - API mudou? Documente aqui
   - Encontrou edge case? Adicione na seção correspondente
   - Melhorou o script? Atualize o fluxo

## Aprendizados e melhorias

### 2026-01-14
- Criação da diretiva inicial
- Identificado que CSV precisa conversão prévia para JSON
- Documentado fluxo completo de ingestão com deduplicação
- **Fix aplicado**: Adicionado `require("dotenv").config()` no início do script `scripts/upsert-google-reviews.js` para carregar variáveis do arquivo `.env` automaticamente
- **Resultado**: Upsert de 914 reviews únicos (de 1266 no CSV original) com deduplicação automática de 352 duplicatas locais
