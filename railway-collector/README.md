# Railway Collector

Pipeline Node.js para coletar reviews do Google Business Profile usando Apify/Supabase, com execução manual via `/collect` e cron planejado na Railway.

## Requisitos

- Node.js 18+
- `.env` com `APIFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOCATION_ID` etc. (ver `src/utils/config.js`)
- Banco Supabase com as RPCs/migrations `persist_reviews_atomic`, `check_table_column`, `update_location_metrics`

## Setup rápido

```bash
npm install
npm test
node test-collector.js # executa o fluxo end-to-end real (200 reviews)
```

## Endpoint `/collect`

- POST `/collect` dispara o pipeline manualmente
- Resposta 200 inclui `run_id`, `reviews_found`, `reviews_new`, `reviews_updated`, `execution_time_ms`
- Em erro retorna 500 + `run_id` (se criado) para investigação em `collection_runs`
- Logs estruturados via Winston (`logInfo`, `logError`, `logApiCall`)

## Testes e validação

- `npm test` (inclui `tests/server.collect.test.js` com supertest + mocks)
- `node test-collector.js` (usa Apify/Supabase reais)
- Script sintético: `npm run generate:synthetic-reviews -- --base ../tmp_apify_samples/sample_normalized_*.json --new 2 --updated 2`
  - Saída: arquivo JSON com `incoming_reviews` (novos/atualizados) + `existing_reviews` para popular o banco antes da rodada
  - Use para validar contagens `reviews_new`/`reviews_updated`

## Cron Railway (worker dedicado)

- Worker diário às 06h BRT chamando `/collect` do Railway Collector
- Executar com `ENABLE_CRON=true` + `COLLECTOR_SERVICE_URL` apontando para o serviço (ver `config/cron.sample.env`)
- Secrets obrigatórios para pipeline principal:
  - `APIFY_TOKEN`, `APIFY_ACTOR_ID`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Checklist de deploy: `npm test`, `node test-collector.js`, (opcional) dataset sintético

## Observabilidade

- Métricas principais em `collection_runs` (`reviews_found`, `reviews_new`, `reviews_updated`, `status`)
- `logs/combined.log` em dev; Railway → console/winston JSON
- Health endpoints: `/health`, `/status`, `/ready`, `/metrics`

## Próximos passos

1. Configurar cron Railway e alertas (falha grava run com `status=failed` + `error_message`)
2. Atualizar `CONFIGURACAO_FINAL_SISTEMA.md` com fluxo Railway x Edge
3. Planejar remoção de legado (scripts Edge Function) quando cron estiver estável
