# OPEN-QUESTIONS — Resolvidas e em Aberto

> Histórico de perguntas que bloquearam decisões. Todas as 10 perguntas originais foram resolvidas em 2026-04-09, combinando respostas explícitas do Senhor e decisões delegadas ao agente. Este documento é o registro auditável.

---

## ✅ Q1 — Scraper custom: manter ou eliminar?

**Resolução:** **Reconstruir do zero em Python na Fase 4.** O scraper atual (`scraper/` Node + Playwright) é deletado na Fase −1. Nova implementação em `workers/app/tasks/scraping.py` usando primariamente DataForSEO (httpx async) e, se necessário, `playwright-python` async.

Decidido pelo Senhor em 2026-04-09: "Pode deletar as scraper tools e afins. Vamos construir um scraper novo do zero depois. Seguiremos usando python, não node.js."

---

## ✅ Q2 — Host do frontend em produção

**Resolução:** **Railway.** Todo o sistema roda em containers na Railway — frontend, backend, workers, redis. Supabase fica fora (banco + IdP).

Decidido pelo Senhor em 2026-04-09: "Vamos fazer o backend como containers que rodarão todos na railway, o supabase fica apenas como banco de dados."

---

## ✅ Q3 — Chaves legadas JWT: já revogadas?

**Resolução:** **NÃO, ativas em produção.** Testado em 2026-04-09:
```
Legacy anon JWT           → HTTP 200
Legacy service_role JWT   → HTTP 200
New publishable           → HTTP 200
```

Ação: **rotação é a primeira task da Fase 0 (T0.1.a)**. As chaves estão em texto claro em `.env.docker` commitado, acessíveis a qualquer pessoa com acesso ao repositório desde a criação.

---

## ✅ Q4 — Cron externo em produção hoje

**Resolução:** **Não há cron ativo.** Inspeção de `collection_runs` em 2026-04-09 mostra que a última execução foi `2025-09-25 01:05 UTC`, seguida de nenhuma outra. Sistema de coleta parado há ~6 meses.

**Impacto:** simplifica a Fase 0. Não há janela de manutenção a negociar, não há risco de gap de coleta. A Fase 4 reintroduz automação sobre arq.

---

## ✅ Q5 — Número e perfil dos usuários iniciais

**Resolução (decisão delegada):**

Três roles fixos:
- **`admin`**: CRUD completo, gerencia usuários, configura coleta, vê audit log.
- **`manager`**: vê tudo, edita colaboradores, não gerencia usuários nem configura coleta.
- **`viewer`**: somente leitura.

Quantidade de cada role parametrizável via admin panel. Bootstrap do primeiro admin via comando CLI (`python -m backend.scripts.bootstrap_admin`) sem UI. Invite-only depois disso.

Se o Senhor quiser roles mais granulares (ex.: separar "operador de coleta" de "gestor de RH"), podemos estender em uma fase posterior sem breaking change.

---

## ✅ Q6 — Plano Supabase atual

**Resolução:** **Free** (confirmado pelo Senhor em 2026-04-09).

**Implicações aplicadas:**
- `pg_cron` e `pg_net` indisponíveis → automação via arq no container worker Railway.
- Sem PITR nativo → backup lógico semanal via task arq (Fase 5).
- Sem logs retidos de longo prazo → Railway Logs cobre stdout/stderr; Sentry cobre erros.
- Edge Functions continuam disponíveis (free tier), mas **não as usaremos como runtime de aplicação** — são apenas histórico a ser aposentado na Fase 4.

---

## ✅ Q7 — Budget para ferramentas pagas

**Resolução (decisão delegada):** **zero adicional para começar**.

- **Supabase Free** — mantido.
- **Railway** — plano Hobby ou Developer (até $5 USD grátis/mês durante trial; depois pay-as-you-go). O projeto inteiro deve caber em <$20/mês inicialmente.
- **Sentry Developer (Free)** — 5k erros/mês, suficiente para começo.
- **Resend Free** — 3k e-mails/mês, cobre alertas e reset de senha.
- **GitHub Actions Free** — 2000 min/mês gratuitos, suficiente para CI inicial.
- **DataForSEO** — custo é por chamada, será medido na Fase 4 antes de decidir.

**Upgrade path:**
- Sentry Team ($26/mês) se precisarmos Slack integration.
- Supabase Pro ($25/mês) se precisarmos PITR real ou pg_cron (provavelmente desnecessário já que temos arq).
- Railway Pro ($20/mês) quando uso crescer.

---

## ✅ Q8 — Scraper migrations: há dados a preservar?

**Resolução:** **Podem ser deletados.** Decidido pelo Senhor em 2026-04-09.

**Executado em 2026-04-09:**
- `google-maps-scraper-tool/` (32 MB) — **deletado** via `rm -rf`.
- `railway-collector/` (80 MB) — **deletado** via `rm -rf`.
- Total liberado: ~112 MB.

Nenhum era rastreado pelo git; estavam apenas no working tree.

---

## ✅ Q9 — Domínio / branding do dashboard

**Resolução (decisão delegada):** **Subdomain Railway para começar** (`*.up.railway.app`), domínio customizado definido antes do Fase 3 go-live.

Quando o Senhor tiver o domínio escolhido (ex.: `dashboard.cartoriopaulista.com.br`), ajustamos:
- Railway custom domain.
- Variáveis de ambiente `CORS_ORIGINS`, `SESSION_COOKIE_DOMAIN`.
- Supabase Auth URL allowlist.
- Certificado TLS (automático via Railway).

---

## ✅ Q10 — Consentimento para notificações por e-mail

**Resolução (decisão delegada):** **Resend Free** (3k e-mails/mês) + in-app.

- Backend envia transacionais via Resend API (`httpx`): reset de senha, invite, alertas críticos.
- Notificações in-app via tabela `notifications` + polling (ou futuramente WebSocket).
- Templates em React Email ou strings simples (decisão na Fase 1/5).
- Domínio `resend.dev` inicialmente; domínio próprio do cartório quando o Senhor tiver um.

---

## 📋 Decisões adicionais tomadas em 2026-04-09 (delegação)

Estas não estavam em perguntas abertas, mas vieram à tona durante o snapshot de produção e o Senhor me autorizou a decidir:

### D-new — Destino dos backups `*_backup_cp` e `*_legacy_archive`

**Decisão:** mover para schema `archive` com RLS default-deny na Fase 0. Drop fica para decisão posterior (>90 dias) após confirmação de que ninguém usa. Ver D16 em `DESIGN-DISCUSSION.md`.

### D-new — Qual `location_id` é canônico

**Decisão:** `cartorio-paulista-location` (o que a coleta scheduled usava). Migration `consolidate_location_id` na Fase 0 reassocia os 4.421 reviews de `cartorio_paulista_main` para `cartorio-paulista-location`. Ver D17.

### D-new — Colaboradores inativos

**Decisão:** permanecem visíveis no histórico; toggle na UI para ocultar. Soft-delete via `deleted_at` é mecanismo separado se precisarmos remover completamente. Ver D18.

---

## Em aberto para fases futuras (não bloqueantes agora)

Nada. Todas as perguntas necessárias para começar estão respondidas. Novas perguntas surgirão naturalmente quando redigirmos as specs das fases 1-5.
