# Edge Functions Audit — 2026-04-09 (Fase 0 T0.0)

> Auditoria pré-rotação das 9 Edge Functions ativas em produção no projeto Supabase `bugpetfkyoraidyxmzxu`. O objetivo é determinar se a rotação de chaves legadas (T0.1) e a revogação de grants a `anon`/`authenticated` (T0.5) quebram alguma função deployada antes de o Senhor executar os gates humanos.
>
> Método: para cada função, o código-fonte deployado foi baixado via `npx supabase functions download --project-ref bugpetfkyoraidyxmzxu` para diretório isolado em `/tmp/sb-audit` (CLI recusa rodar dentro do repo por causa de `supabase/config.toml` com `db.major_version = 16`). Os artefatos foram copiados para `.tmp/edge-functions-audit/` (gitignored, **não commitados**) e inspecionados manualmente. Leitura paralela de cada `index.ts`, `_shared/db.ts`, `_shared/google.ts` e `_shared/dataforseo.ts`, seguida de varredura automatizada por padrões sensíveis (`ANON_KEY`, `sb_publishable_`, `sb_secret_`, `eyJhbGciOi`, `sbp_`).
>
> Listagem via Management API confirmou 9 funções ativas com as mesmas versões do snapshot `prod-state-2026-04-09.md` §6. Nenhum drift entre snapshot e estado atual.

---

## Sumário executivo

- **Funções analisadas:** 9
- **Safe** (usam `SUPABASE_SERVICE_ROLE_KEY` e sobrevivem à revogação de grants anon): **8**
- **Safe mas estrutural vazia** (stub sem lógica): **1** (`auto-collector`)
- **At-risk (anon)**: **0**
- **At-risk (legacy JWT hardcoded)**: **0**

- **Veredito para T0.1 — rotação das chaves legadas JWT:** *safe to proceed*, **com uma ressalva operacional crítica.** Nenhuma função tem JWT legado hardcoded no código; todas leem `SUPABASE_SERVICE_ROLE_KEY` da Deno env. Porém, o valor dessa env var no runtime Supabase **é hoje o JWT legado service_role** (confirmado por `prod-state-2026-04-09.md` §2 — as chaves novas `sb_secret_*` foram geradas em paralelo mas o runtime de Edge Functions continua com a legada). O Senhor precisa, **no mesmo procedimento de rotação**, atualizar a variável de ambiente `SUPABASE_SERVICE_ROLE_KEY` das Edge Functions no console Supabase para o novo `sb_secret_*` **antes** (ou simultaneamente) à revogação da legada. Caso contrário, as 8 funções que fazem I/O com o banco quebram instantaneamente.

- **Veredito para T0.5 — revogação de grants a `anon`/`authenticated` nas funções Postgres custom:** *safe to proceed*. Como todas as 8 funções ativas usam `service_role` (que ignora grants e RLS via `bypassrls`), a revogação não afeta nenhuma delas. As RPCs chamadas (`claim_nlp_review`, `complete_nlp_review`, `fail_nlp_review`, `enqueue_nlp_review`, `process_review_collaborator_jobs`) continuam acessíveis sob `service_role`.

- **Segredos hardcoded encontrados:**
  - `dataforseo-lookup/index.ts:34` — credencial **DataForSEO API** hardcoded como header Basic Auth: `<HARDCODED_SECRET_FOUND>`. **Não é segredo Supabase** — é um base64 de `usuário:senha` da conta DataForSEO do Cartório. Ainda assim, é um segredo de terceiros versionado no runtime deployado, contornando a política de env vars. **Ação recomendada:** rotacionar junto com as chaves Supabase (ver §Recomendações); a função está obsoleta pois a coleta parou há 6 meses.
  - Nenhum JWT legado, nenhum `sb_publishable_`, nenhum `sb_secret_`, nenhum `sbp_` encontrado em qualquer função.

---

## Tabela-resumo

| Função | Versão | Key usada | RPCs chamadas | Tabelas tocadas | Classificação |
|---|---:|---|---|---|---|
| `dataforseo-lookup` | 5 | nenhuma (chama apenas DataForSEO API externa) | — | — | **Safe** (mas com segredo DataForSEO hardcoded) |
| `auto-collector` | 5 | n/a (stub vazio) | — | — | **Safe (stub vazio)** |
| `scheduler` | 4 | `SERVICE_ROLE_KEY` (via Bearer para functions/v1/*) | — (invoca outras functions) | — | **Safe** |
| `alerts` | 3 | `SERVICE_ROLE_KEY` | — | `reviews` (R), `review_labels` (R), `review_alerts` (R/W) | **Safe** |
| `classifier` | 3 | `SERVICE_ROLE_KEY` | `claim_nlp_review`, `complete_nlp_review`, `fail_nlp_review` | `reviews` (R), `review_labels` (U), `services` (R), `review_services` (U) | **Safe** |
| `dataforseo-reviews` | 3 | `SERVICE_ROLE_KEY` | — | `reviews` (R/U/I), `collection_runs` (I) | **Safe** |
| `gbp-backfill` | 3 | `SERVICE_ROLE_KEY` | `enqueue_nlp_review` | `reviews_raw` (U), `reviews` (U) | **Safe** |
| `gbp-webhook` | 3 | `SERVICE_ROLE_KEY` | `enqueue_nlp_review` | `reviews_raw` (U), `reviews` (U) | **Safe** |
| `review-collaborator-jobs` | 2 | `SERVICE_ROLE_KEY` (via `../_shared/db.ts`) | `process_review_collaborator_jobs` | — (tudo via RPC) | **Safe** |

Legenda: R=SELECT, I=INSERT, U=UPSERT, W=INSERT/UPDATE.

---

## Detalhe por função

### `dataforseo-lookup` (v5, 2025-08-29)

- **Arquivo principal:** `.tmp/edge-functions-audit/dataforseo-lookup/index.ts` (126 linhas; não commitado)
- **Env vars lidas:** nenhuma (!)
- **Clients Supabase criados:** nenhum.
- **RPCs:** nenhuma.
- **Tabelas:** nenhuma.
- **Ação:** atua como proxy HTTP para `https://api.dataforseo.com/v3/serp/google/local_finder/live/advanced` e `.../serp/google/maps/live/advanced`, recebendo `action` + `keyword` via POST.
- **Segredo hardcoded:** na linha 34:
  ```ts
  // Temporariamente usar credenciais hardcoded para teste
  const authHeader = '<HARDCODED_SECRET_FOUND>'; // base64 de user:senha DataForSEO
  ```
  O comentário "temporariamente" tem pelo menos 8 meses de idade. A credencial é base64 de `<email>@cartoriopaulista.com.br:<password>` da conta DataForSEO.
- **Classificação:** **Safe** para a rotação Supabase (não toca no banco). Fora do escopo de Fase 0, porém o segredo hardcoded é dívida técnica que deve entrar no backlog de rotação de credenciais de terceiros.
- **Notas:** função é candidata a aposentadoria na Fase 4 (coleta via DataForSEO será substituída por GBP API direta).

---

### `auto-collector` (v5, 2025-09-24)

- **Arquivo principal:** `.tmp/edge-functions-audit/auto-collector/index.ts` (0 linhas úteis; corpo efetivamente vazio)
- **Env vars lidas:** nenhuma.
- **Clients Supabase criados:** nenhum.
- **RPCs:** nenhuma.
- **Tabelas:** nenhuma.
- **Conteúdo real:** o eszip deployado contém apenas um source map base64 trivial e os marcadores de seção `---SUPABASE-ESZIP-*---`. Não há código JavaScript/TypeScript executável. É um stub — qualquer invocação retorna, na prática, sem lógica.
- **Classificação:** **Safe (stub vazio)**.
- **Notas:** o `scheduler` (v4) tenta invocar `auto-collector` via `POST ${supabaseUrl}/functions/v1/auto-collector` com body `{action:"run_collection"}`. Como a função está vazia, essa invocação é um no-op de cerca de 6 meses. **Este é o achado estrutural que explica por que a coleta automática parou em 2025-09-25**: o `scheduler` continua disparando, mas a função que faria o trabalho foi esvaziada (deploy acidental, rollback manual, ou substituição incompleta — a causa raiz não é determinável só pela auditoria). Registrar como achado para revisitar na Fase 4 (reconstrução do coletor).

---

### `scheduler` (v4, 2025-12-03)

- **Arquivo principal:** `.tmp/edge-functions-audit/scheduler/index.ts` (63 linhas; não commitado)
- **Env vars lidas:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Clients Supabase criados:** nenhum (`createClient` não é usado). Em vez disso, monta headers manualmente com `Authorization: Bearer ${serviceKey}` e invoca outras Edge Functions via `fetch`.
- **RPCs:** nenhuma diretamente.
- **Tabelas:** nenhuma diretamente.
- **Outras functions invocadas:** `auto-collector` (stub vazio hoje), `review-collaborator-jobs?limit=100`.
- **Classificação:** **Safe**.
- **Notas críticas:**
  1. Usa `serviceKey` como Bearer token contra o próprio endpoint `/functions/v1/*` do Supabase. Hoje isso resolve para o JWT legado. **Quando a variável de ambiente for atualizada para o novo `sb_secret_*`, funciona normalmente** — o endpoint aceita ambos enquanto o legado não for revogado, e aceita só o novo depois.
  2. Este é o único ponto de observabilidade de que o scheduler chama `auto-collector`, o que explica a cadeia de falha da coleta.

---

### `alerts` (v3, 2025-09-01)

- **Arquivo principal:** `.tmp/edge-functions-audit/alerts/index.ts` (78 linhas; não commitado)
- **Env vars lidas:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (via `_shared/db.ts#getServiceClient`), `SLACK_WEBHOOK_URL`.
- **Clients criados:** `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession:false, autoRefreshToken:false}})`.
- **RPCs:** nenhuma.
- **Tabelas:** `reviews` (SELECT), `review_labels` (SELECT via inner join), `review_alerts` (SELECT, INSERT).
- **Classificação:** **Safe**.
- **Notas:** usa apenas table API com `service_role`, não depende de grants revogáveis.

---

### `classifier` (v3, 2025-09-01)

- **Arquivo principal:** `.tmp/edge-functions-audit/classifier/index.ts` (142 linhas; não commitado)
- **Env vars lidas:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (via `_shared/db.ts#getServiceClient`).
- **Clients criados:** `createClient(url, service_role_key, {auth:{persistSession:false, autoRefreshToken:false}})`.
- **RPCs:** `claim_nlp_review(p_worker_id)`, `complete_nlp_review(p_review_id)`, `fail_nlp_review(p_review_id, p_error)`.
- **Tabelas:** `reviews` (SELECT), `review_labels` (UPSERT), `services` (SELECT por `name='e-notariado'`), `review_services` (UPSERT).
- **Classificação:** **Safe**.
- **Notas:** todas as três RPCs chamadas estão na lista de revogação de T0.5, mas `service_role` é `bypassrls` e não precisa de grant explícito — a revogação apenas remove `anon, authenticated, public` do `GRANT EXECUTE`, preservando o acesso via `service_role`. Confirmado no template SQL do `revoke_anon_grants` (SPEC §3.4).

---

### `dataforseo-reviews` (v3, 2025-09-01)

- **Arquivo principal:** `.tmp/edge-functions-audit/dataforseo-reviews/index.ts` (186 linhas; não commitado)
- **Env vars lidas:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Clients criados:** `createClient(supabaseUrl, supabaseKey)` — `supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. (Sem opções extras de auth; comportamento ainda é service_role porque o JWT fornecido é service_role.)
- **RPCs:** nenhuma.
- **Tabelas:** `reviews` (SELECT por id, UPDATE, INSERT), `collection_runs` (INSERT).
- **Classificação:** **Safe**.
- **Notas:** credenciais DataForSEO são puxadas via `./_shared/dataforseo.ts` (6 KB — não inspecionado linha-a-linha, mas grep por padrões sensíveis retorna zero hits). Presume-se que use `Deno.env.get('DATAFORSEO_*')` — deve ser verificado se o Senhor quiser fechar o gap do segredo hardcoded de `dataforseo-lookup`.

---

### `gbp-backfill` (v3, 2025-09-01)

- **Arquivo principal:** `.tmp/edge-functions-audit/gbp-backfill/index.ts` (55 linhas; não commitado)
- **Env vars lidas:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (via `_shared/db.ts#getServiceClient`), `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`, `GBP_REFRESH_TOKEN` (via `_shared/google.ts#fetchAccessToken`).
- **Clients criados:** `createClient(url, service_role_key, {auth:{persistSession:false, autoRefreshToken:false}})`.
- **RPCs:** `enqueue_nlp_review(p_review_id)`.
- **Tabelas:** `reviews_raw` (UPSERT por `review_id`), `reviews` (UPSERT por `review_id`).
- **Classificação:** **Safe**.
- **Notas:** faz paginação de até 5 páginas de 50 reviews por execução via GBP API v4. Depende de `GBP_*` env vars — **se o Senhor tiver rotacionado ou expirado o refresh token do Google, a função está quebrada independentemente de Fase 0**. Recomendo teste pós-rotação Supabase.

---

### `gbp-webhook` (v3, 2025-09-01)

- **Arquivo principal:** `.tmp/edge-functions-audit/gbp-webhook/index.ts` (63 linhas; não commitado)
- **Env vars lidas:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (via `_shared/db.ts`), `GBP_CLIENT_ID`/`SECRET`/`REFRESH_TOKEN` (via `_shared/google.ts`), `WEBHOOK_SECRET` (opcional, para validação de origem).
- **Clients criados:** idem `gbp-backfill`.
- **RPCs:** `enqueue_nlp_review(p_review_id)`.
- **Tabelas:** `reviews_raw` (UPSERT), `reviews` (UPSERT).
- **Classificação:** **Safe**.
- **Notas:** aceita envelope Pub/Sub (decodifica `message.data` base64) e busca o review via GBP API. A validação opcional via `x-webhook-secret` não está sendo usada (não verificado se `WEBHOOK_SECRET` está setada em prod; se não estiver, o endpoint aceita qualquer POST — risco menor fora do escopo de Fase 0, registrar no backlog).

---

### `review-collaborator-jobs` (v2, 2025-12-03)

- **Arquivo principal:** `.tmp/edge-functions-audit/review-collaborator-jobs/index.ts` (61 linhas; não commitado)
- **Env vars lidas:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (via `../_shared/db.ts#getServiceClient`).
- **Clients criados:** `createClient(url, service_role_key, ...)` — a função importa `getServiceClient` de `../_shared/db.ts`, que no eszip deployado não foi extraído como arquivo separado pelo CLI (eszip v2.3 com estrutura multiarquivo diferente), mas a assinatura do import e o nome da função confirmam o mesmo padrão das outras 7 funções.
- **RPCs:** `process_review_collaborator_jobs(p_limit)`.
- **Tabelas:** nenhuma diretamente (todo o trabalho é delegado à RPC Postgres).
- **Classificação:** **Safe**.
- **Notas:** a RPC `process_review_collaborator_jobs` **não está na lista de revogação de T0.5** (ver `prod-state-2026-04-09.md` §5). A lista de revogação aponta `reprocess_reviews_for_collaborator`, `enqueue_review_collaborator_job` e `enqueue_collaborator_refresh_job`, mas não `process_review_collaborator_jobs`. Isso é consistente: `process_review_collaborator_jobs` é o consumer (executado por `service_role`), enquanto os três revogados são os enqueuers (que hoje estão expostos a `anon`). A revogação fecha o vetor de enqueue sem quebrar o consumer. Comportamento correto.

---

## Cross-reference: RPCs chamadas × RPCs a revogar em T0.5

Lista oficial de revogação (do prompt e de `prod-state-2026-04-09.md` §5):

| RPC a revogar (T0.5) | Alguma função chama? | Se sim, qual key? | Quebra? |
|---|---|---|---|
| `persist_reviews_atomic` | não | — | não |
| `update_location_metrics` | não | — | não |
| `refresh_monthly_view` | não | — | não |
| `cleanup_legacy_from_dataset` | não | — | não |
| `reprocess_reviews_for_collaborator` | não | — | não |
| `create_auto_alerts` | não | — | não |
| `process_collaborator_mentions` | não | — | não |
| `enqueue_review_collaborator_job` | não | — | não |
| `enqueue_collaborator_refresh_job` | não | — | não |
| `enqueue_nlp_review` | **sim** — `gbp-backfill`, `gbp-webhook` | `service_role` | **não** |
| `claim_nlp_review` | **sim** — `classifier` | `service_role` | **não** |
| `complete_nlp_review` | **sim** — `classifier` | `service_role` | **não** |
| `fail_nlp_review` | **sim** — `classifier` | `service_role` | **não** |

Todas as RPCs efetivamente em uso estão sob `service_role`, que ignora o `GRANT EXECUTE` do Postgres (a revogação só afeta `anon`, `authenticated`, `public`). Conclusão consistente com o veredito do sumário.

---

## Recomendações acionáveis

1. **[Bloqueante para T0.1] Atualizar `SUPABASE_SERVICE_ROLE_KEY` das Edge Functions antes (ou durante) a rotação.** No console Supabase Dashboard → Edge Functions → Secrets, substituir o valor de `SUPABASE_SERVICE_ROLE_KEY` pelo novo `sb_secret_*` **antes** de clicar em "Revoke legacy JWT secret". A janela entre as duas ações deve ser zero para evitar quebra momentânea. Testar com `curl` pós-rotação conforme AC-0.1.
2. **[Recomendado, não-bloqueante] Aposentar `auto-collector` stub.** O deploy atual é um no-op há 6 meses. Manter a função ativa apenas confunde o operador. Sugiro remover o deployment (desativar, não excluir histórico) ao final da Fase 0 ou no início da Fase 4, com nota no CHECKPOINT.
3. **[Recomendado, não-bloqueante] Rotacionar a credencial DataForSEO hardcoded em `dataforseo-lookup`.** Não é escopo de Fase 0, mas o segredo está exposto a qualquer um com acesso de leitura ao Supabase Dashboard. Abrir item no backlog Fase 4 (ou em um sub-ticket de dívida técnica imediato).
4. **[Recomendado] Verificar `WEBHOOK_SECRET` em `gbp-webhook`.** Se a env var não estiver definida, o endpoint aceita invocações arbitrárias. Validar no Dashboard; setar se faltante.
5. **[Registrar] `scheduler` → `auto-collector` é a cadeia quebrada da coleta.** Documentar no CHECKPOINT da Fase 0 como achado colateral da auditoria; não corrigir agora (Fase 4).

Todas as recomendações acima são **independentes dos vereditos de T0.1 e T0.5**: a Fase 0 pode prosseguir sem bloqueios, desde que o item 1 (atualizar env var) seja executado junto com a rotação.

---

## Apêndice — comandos de verificação

O Senhor pode reproduzir os passos centrais da auditoria com:

```bash
# 1. Listar functions deployadas
curl -sS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/bugpetfkyoraidyxmzxu/functions" | jq '.[] | {slug,version,status}'

# 2. Download de uma função (fora do repo por conflito com supabase/config.toml)
mkdir -p /tmp/sb-audit && cd /tmp/sb-audit
npx --yes supabase@latest init --force
npx --yes supabase@latest functions download <slug> --project-ref bugpetfkyoraidyxmzxu

# 3. Grep por padrões sensíveis
grep -RIn -E 'ANON_KEY|anon_key|sb_publishable_|sb_secret_|eyJhbGciOi|sbp_' /tmp/sb-audit/supabase/functions/

# 4. Listar RPCs chamadas
grep -RIn -E '\.rpc\(' /tmp/sb-audit/supabase/functions/

# 5. Listar tabelas tocadas
grep -RIn -E '\.from\("' /tmp/sb-audit/supabase/functions/
```

Saída esperada em 3: apenas zero matches (exceto o segredo DataForSEO em `dataforseo-lookup/index.ts:34`, que não casa com os regex acima por ser um base64 arbitrário — redacted in this report as `<HARDCODED_SECRET_FOUND>`).

---

**Status final:** T0.0 concluído. Fase 0 liberada para seguir para T0.1 (gate humano, **com a ressalva operacional do item 1 das Recomendações**) e T0.5 (sem ressalvas).
