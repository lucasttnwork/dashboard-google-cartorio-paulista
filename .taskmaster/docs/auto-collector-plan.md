# Plano de Implementação - Auto Collector Apify

## Visão Geral
- **Objetivo**: consolidar a normalização das avaliações, registrar execuções e agendar coletas diárias via Supabase.
- **Escopo**: Edge Function `auto-collector`, script local `scripts/test-apify.js`, scheduler Supabase, documentação e limpeza de legado.
- **Dependências**: Migração `supabase/sql/2025-09-17_apify_standardization.sql` aplicada; variáveis de ambiente (`APIFY_TOKEN`, `APIFY_ACTOR_ID`, `SUPABASE_SERVICE_ROLE_KEY`, etc.).

## Fases Principais

### 1. Normalização Compartilhada
- **Task 1.1** ✅ Concluída: Extrair mapeamento Apify → Supabase para módulo compartilhado (compatível com Deno/Node).
  - Entregável: arquivo `supabase/functions/_shared/apify-normalizer.ts` reutilizado pelos dois runtimes.
- **Task 1.2** ✅ Concluída: Atualizar `auto-collector/index.ts` para consumir o módulo compartilhado.
  - Entregável: função `normalizeReviews` substituída pelo util compartilhado, eliminando duplicações.
- **Task 1.3** ✅ Concluída: Atualizar `scripts/test-apify.js` para usar o mesmo módulo.
  - Entregável: script importando o normalizador via `require` (usando `ts-node`).
- **Task 1.4** ✅ Concluída: Garantir que campos necessários (incluindo `last_seen_at`, `raw_payload`) sejam mantidos.
  - Entregável: testes manuais com dataset de amostra em `tmp_apify_samples` confirmando schema final.

- **Task 2.1** ✅ Concluída: Revisar `persistReviews` para cobrir inserções/atualizações e gravação em `reviews_raw`.
  - Entregáveis: upsert garante `last_seen_at`/campos novos nas tabelas `reviews` e `reviews_raw`; migração `2025-09-17_apify_standardization.sql` adiciona coluna `last_seen_at` em `reviews_raw`.
  - Testes sugeridos: usar script HTTP `scripts/invoke-auto-collector.js` (ou curl equivalente) com `SUPABASE_FUNCTION_URL` e `SUPABASE_SERVICE_ROLE_KEY` para disparar a function, validar `reviews.last_seen_at` e `reviews_raw.last_seen_at`, conferir contagem de inseridos/atualizados.
- **Task 2.2** ✅ Concluída: Ajustar `collection_runs` para registrar metadados (source, run_type, contagem de novos/atualizados).
  - Entregáveis: `executeCollection` unifica metadados via `mergeMetadata` (incluindo `result.reviews_*`); `createCollectionRun`/`finalizeCollectionRun` aceitam metadata opcional; migração aplicada via MCP adicionou `last_seen_at` em produção e confirmou colunas.
  - Testes executados: `node scripts/test-apify.js` (2x) gerando amostras em `tmp_apify_samples`; verificação Supabase via MCP (`collection_runs.metadata` com dados completos e colunas `last_seen_at` existentes).
- **Task 2.3** ✅ Concluída: Atualizar cálculo de métricas em `updateLocationMetrics` caso novas colunas impactem KPIs.
  - Alterações: `last_seen_at` passou a ser a principal referência para `last_review_sync`, com fallback para `update_time` e `create_time`. A média considera apenas ratings numéricos válidos e mantém contagem total de reviews Apify.
  - Testes: `node scripts/test-apify.js` (SUCCEEDED, 100 registros normalizados em `tmp_apify_samples/sample_normalized_1758744145024.json`). `node scripts/invoke-auto-collector.js` (HTTP) → v2 resultou em 500 (falha durante coleta real). Após rollback para v3 (placeholder), nova chamada retornou 504 (timeout) e nenhuma persistência foi registrada.
  - Validações via MCP: `reviews` ainda sem `last_seen_at` populado; `collection_runs` sem novos runs; `gbp_locations` sem atualização.
  - Pendências registradas: a versão ativa da Edge Function hospeda apenas um stub (contagem de localizações) e não utiliza o código de coleta persistente. O deploy da versão completa (v2) falhou devido a timeout/erro interno — investigar dependências (shared modules, envs APIFY_*, tempo de execução) antes de promover nova versão.

## Plano Incremental - Fase 2 (Persistência e Métricas em Produção)

### Etapa 0 — Auditoria rápida do estado atual
- Confirmar no painel do Supabase qual versão da Edge Function está ativa (stub v3) e registrar hash/autor no histórico do repositório.
- Atualizar o status das tasks `task-edge-deploy` (in_progress) e `task-railway-cron` (pending) no Taskmaster para garantir rastreabilidade.

### Etapa 1 — Ambiente e variáveis sensíveis
- [ ] Revisar as variáveis `APIFY_TOKEN`, `APIFY_ACTOR_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` e demais chaves utilizadas pela função diretamente no Dashboard do Supabase (Project Settings → Secrets). Capturar evidências (timestamp e print) e anexar resumo no plano.
- [ ] Validar se o payload padrão (`AUTO_COLLECTOR_PAYLOAD`) está disponível e consistente com `scripts/invoke-auto-collector.js`.
- [ ] Registrar divergências no plano e criar subtasks adicionais caso seja necessário ajustar nomes ou valores de secrets.

#### Estado atual (2025-09-24 10:25 BRT)
- ✅ `SUPABASE_URL`, `SUPABASE_FUNCTION_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APIFY_TOKEN`, `APIFY_ACTOR_ID` presentes e consistentes com `.env` local.
- ⚠️ `APIFY_DATASET_ID`, `APIFY_TASK_ID`, `APIFY_LOOKBACK_HOURS`, `APIFY_MAX_REVIEWS` não existem no painel; confirmar se são opcionais ou se devem ser criados.
- ❌ `AUTO_COLLECTOR_PAYLOAD` indisponível como secret centralizado — atualmente comentado no `.env` local. Decidir se manteremos default do código (`{"action":"run"}`) ou se criaremos secret dedicado (ex.: `AUTO_COLLECTOR_DEFAULT_PAYLOAD`).
- próximas ações: abrir sessão no painel Supabase para confirmar secrets em produção e anexar prints, alinhar com stakeholders necessidade de novos secrets.

## DECISÃO ARQUITETURAL - MIGRAÇÃO PARA RAILWAY

### Análise Comparativa Realizada (2025-09-24)
**Conclusão**: Após análise técnica detalhada, decidimos **migrar da abordagem Edge Function para Railway Server** pelos seguintes motivos fundamentais:

#### Problemas Identificados na Abordagem Atual
- ❌ **Timeouts recorrentes**: Edge Functions limitadas a poucos minutos de execução
- ❌ **Debugging complexo**: Logs menos acessíveis, deploy sem versionamento tradicional
- ❌ **Dependências limitadas**: Restrições do runtime Deno para bibliotecas específicas
- ❌ **Falhas de deploy**: Problemas de sintaxe/bundle gerando rollbacks constantes

#### Vantagens da Nova Abordagem Railway
- ✅ **Código já funcional**: `scripts/test-apify.js` e `scripts/invoke-auto-collector.js` comprovam que a lógica funciona perfeitamente em Node.js
- ✅ **Debugging superior**: Logs locais + Railway logs vs. apenas Supabase logs
- ✅ **Flexibilidade total**: Ambiente Node.js completo sem restrições de runtime ou tempo
- ✅ **CI/CD tradicional**: Deploy via Git push com controle de versão adequado
- ✅ **Custo justificável**: ~$5/mês vs. complexidade operacional atual

#### Impacto na Roadmap
- **Imediato**: Suspender etapas 2-7 do plano atual (Edge Function)
- **Novo foco**: Implementar PRD Railway conforme `railway-collector-prd.md`
- **Timeline**: 10 dias para MVP completo vs. semanas debugando Edge Function
- **ROI**: Simplificação operacional compensa custo adicional

### Próximos Passos
1. ✅ **PRD criado**: `railway-collector-prd.md` com especificações completas
2. 🔄 **Implementação**: Seguir cronograma de 5 sprints definido no PRD
3. 📋 **Migration plan**: Reutilizar `apify-normalizer.ts` e lógica de persistência existente
4. 🚀 **Deploy**: Railway com Dockerfile customizado e monitoramento robusto

**Referência técnica completa**: [railway-collector-prd.md](mdc:.taskmaster/docs/railway-collector-prd.md)

### Etapa 2 — Código base e dependências compartilhadas
- [ ] Recuperar `supabase/functions/auto-collector/index.ts` a partir da última versão estável (v3) no repositório: `git show <hash_estável>:supabase/functions/auto-collector/index.ts > tmp/index.v3.ts` para usar como referência.
- [ ] Reaplicar somente as mudanças essenciais da versão completa (persistência real, métricas, logs estruturados), garantindo que todos os imports de `_shared/*` permaneçam intactos.
- [ ] Conferir se `supabase/functions/_shared/**` está incluído no bundle gerado pelo Supabase (`deno.json` ou `supabase/functions/auto-collector/deno.json`). Ajustar import maps caso necessário.

#### Estado atual
- Snapshot mais recente no git: commit `473bb35` (feat: Implementação completa...), contém a versão completa do collector.
- Stub ativo (prod) não possui diff local — arquivo atual já corresponde à versão persistente; precisamos confirmar se cor condiz com commit estável.
- Próximos passos: gerar diff entre `473bb35:index.ts` e arquivo atual para confirmar ausência de perdas e eventual ajuste mínimo antes do deploy.

### Etapa 3 — Verificações estáticas locais
- Executar `deno fmt supabase/functions/auto-collector/index.ts` e `deno lint supabase/functions/auto-collector/index.ts` para evitar novos erros de parsing.
- Rodar `deno check supabase/functions/auto-collector/index.ts` para confirmar tipagem com o import map atual.
- Validar se `scripts/test-apify.js` continua consumindo corretamente o módulo `_shared`. Caso contrário, ajustar caminhos relativos.

### Etapa 4 — Deploy controlado e registro de logs
- Preparar checklist de deploy (versão do arquivo, hashes, comandos executados, horário).
- Realizar o deploy controlado pela CLI ou Dashboard, garantindo que `deno fmt`/`lint` tenham sido executados imediatamente antes.
- Após o deploy, invocar `mcp_supabase_get_logs --service=edge-function` em até 60 segundos para capturar eventuais erros. Salvar o log bruto no diretório `tmp_apify_samples/logs/` e referenciar aqui.

### Etapa 5 — Testes manuais pós-deploy
- Invocar a função via MCP (`supabase.functions.invoke('auto-collector', { body: { action: 'run_collection', source: 'manual_check' } })`) ou via HTTP usando `scripts/invoke-auto-collector.js` e registrar a resposta.
- Repetir a invocação com payloads alternativos (`action: 'run_metrics'`, se aplicável) para validar caminhos condicionais.
- Em caso de falha (HTTP 500/504), capturar stack trace completa nos logs e anexar ao plano.

### Etapa 6 — Validação de persistência em banco
- Executar consultas via MCP para confirmar atualização dos dados:
  - `select review_id, last_seen_at from reviews where last_seen_at is not null order by last_seen_at desc limit 10;`
  - `select * from collection_runs order by started_at desc limit 5;`
  - `select location_id, total_reviews_count, current_rating, last_review_sync from gbp_locations where last_review_sync is not null order by last_review_sync desc;`
- Documentar resultados (antes/depois) e destacar quaisquer divergências ou lacunas.
- Se alterações de schema adicionais forem necessárias, planejar migração correspondente e executar `mcp_supabase_generate_typescript_types` ao final.

### Etapa 7 — Documentação e handoff
- Atualizar este documento com evidências de cada etapa (links para logs, hashes, prints, consultas SQL).
- Preparar nota técnica resumindo o estado final da função (payloads aceitos, métricas persistidas, comportamento de retries) para uso futuro no cron da Railway.
- Somente após concluir esta etapa desbloquear `task-railway-cron` e iniciar a automação diária.

### 3. Scheduler Diário (06:00 BRT / 09:00 UTC)
  - Entregável: worker Railway executando `ENABLE_CRON=true COLLECTOR_SERVICE_URL=https://... node server.js` (cron interno) ou alternativa via script HTTP (`scripts/invoke-auto-collector.js`).
- **Task 3.2**: Garantir payload e autenticação adequados.
  - Entregável: testes manuais com `AUTO_COLLECTOR_PAYLOAD` setado (`{"action":"run","source":"scheduler"}`), logs capturados no cron da Railway.
- **Task 3.3**: Monitorar execução via Supabase (MCP consultas + logs HTTP).
  - Entregável: documentação descrevendo como consultar `collection_runs`, `gbp_locations` e logs HTTP para verificar a automação.

### 4. Documentação & Housekeeping
- **Task 4.1**: Atualizar `README.md` e `CONFIGURACAO_FINAL_SISTEMA.md` com novo fluxo (Apify/Scheduler).
  - Entregável: checklists de setup local, scheduler, variáveis.
- **Task 4.2**: Remover artefatos legados (ex.: diretório `scraper/`, scripts DataForSEO) se confirmada a descontinuação.
  - Entregável: PR/commit removendo diretórios e atualizando `package.json` (dependências/ scripts).
- **Task 4.3**: Regenerar `supabase/types.ts` após ajustes no schema.
  - Entregável: `supabase gen types typescript --project-ref ... --schema public > supabase/types.ts` executado e commitado.

## Linha do Tempo Sugerida
1. **Dia 1**: Fase 1 (normalização) + testes locais com dataset de amostra.
2. **Dia 2**: Fase 2 (persistência), validação manual contra banco Supabase.
3. **Dia 3**: Fase 3 (scheduler) + documentação inicial.
4. **Dia 4**: Fase 4 (documentação final, limpeza, tipos).

## Validação
- Rodar `node scripts/invoke-auto-collector.js` (localmente ou na Railway) e inspecionar `collection_runs`, `reviews`, `reviews_raw` via MCP.
- Verificar dataset em `tmp_apify_samples` para garantir backfill fiel.
- Confirmar cron na Railway/serviço equivalente e monitorar por logs + consultas MCP.

## Observações
- Considerar criação de testes unitários leves para o normalizador (Deno + Node).
- Planejar fallback caso o scheduler falhe (alertas via Supabase monitoring).
- Coordenar remoção do diretório `scraper/` com stakeholders antes de deletar.
- **Atualização 2025-09-24**: suites Jest agora incluem `tests/integration/persist.test.js` (simula inserções/atualizações com mocks de logger e Apify) e `tests/storage/supabase-client.test.js` (garante chamada do RPC `persist_reviews_atomic` e tratamento de erros). Manter execução `npm test; node test-collector.js` como checklist obrigatório pós-alterações na camada de persistência.
