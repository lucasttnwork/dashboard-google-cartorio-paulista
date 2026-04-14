# Assessment Crítico — Features e melhorias além da Fase 3.9

**Autor:** JARVIS (mãe orquestradora)
**Data:** 2026-04-14
**Propósito:** análise estratégica do sistema além do escopo imediato da Fase 3.9, para informar o roadmap das Fases 4, 5 e além.
**Metodologia:** inventário factual via Explore agent + cruzamento com roadmap existente + análise de gap contra o domínio "Google Business Profile reviews monitoring".

---

## Contexto

O projeto entregou infra sólida até a Fase 3.8: autenticação, RLS, CRUD, visualizações (KPIs, trends, comparativos, daily granularity), auditoria append-only, observability baseline (Sentry, structlog), CI de segurança (gitleaks). Fase 4 promete automação de coleta + alertas. Fase 5 promete hardening ops (runbooks, backups, load test, LGPD).

**A pergunta que este documento responde:** dado que o baseline está sólido e as fases planejadas cobrem automação e ops, **o que mais esse sistema precisa para maximizar valor para o Cartório Paulista?**

---

## Sumário executivo — tabela de prioridades

| # | Recomendação | Categoria | Prio | Esforço | No roadmap? |
|---|---|---|---|---|---|
| 1 | **Reply-to-review flow** (responder Google Reviews via dashboard) | Produto | **P0** | M (3-5 dias) | ❌ |
| 2 | **Fila de reviews não-respondidos + time-to-reply metric** | Produto | **P0** | S (1-2 dias) | ❌ |
| 3 | **Tags/categorias manuais em reviews + notas internas** | Produto | **P1** | M (2-3 dias) | ❌ |
| 4 | **Saved views / smart filters** ("1-estrela sem resposta", etc) | UX | **P1** | S (1 dia) | ❌ |
| 5 | **Export relatório mensal PDF** | Produto | **P1** | M (2-3 dias) | ❌ |
| 6 | **Automação de coleta Google Reviews + cron** | Automação | **P0** | L (~1 semana) | ✅ Fase 4 |
| 7 | **Alertas por e-mail/Slack em 1-estrela nova** | Automação | **P1** | M | ✅ Fase 4 (parcial) |
| 8 | **axe-core automated a11y tests** | Qualidade | **P1** | S | ❌ |
| 9 | **OpenAPI client gen (eliminar drift lib/api/\*)** | Qualidade | **P1** | S | ❌ |
| 10 | **Backup Postgres automatizado + drill de restore** | Ops | **P0** | M | ✅ Fase 5 |
| 11 | **Runbook de incidente + uptime probe externo** | Ops | **P1** | S | ✅ Fase 5 |
| 12 | **LGPD: right-to-delete + export DPO** | Compliance | **P1** | M | ✅ Fase 5 |
| 13 | **Search fulltext nos comentários (FTS Postgres)** | Produto | **P2** | S | ❌ |
| 14 | **Lighthouse CI + performance budget** | Qualidade | **P2** | S | ❌ |
| 15 | **Keyboard shortcuts (Cmd+K, /, j/k)** | UX | **P2** | M | ❌ |
| 16 | **Empty states audit + polish** | UX | **P2** | S | ❌ |
| 17 | **Visual regression (Chromatic/Percy)** | Qualidade | **P3** | M | ❌ |
| 18 | **Dark mode** | UX | **P3** | S | ❌ |
| 19 | **Topic modeling automático em comentários** | Produto | **P3** | L | ❌ |
| 20 | **Slack/Teams integration** | Automação | **P3** | M | ❌ |
| 21 | **Multi-location UX** (se aplicável) | Produto | **P3** | M | depende |
| 22 | **Dashboard público/embed** | Produto | **P3** | M | ❌ |

**Legenda:**
- **P0** (crítico) — gap que limita o valor principal do produto. Recomendo priorizar.
- **P1** (alto valor) — benefício claro, custo moderado, sem compromissos técnicos.
- **P2** (nice-to-have) — polish e qualidade. Importante cumulativamente.
- **P3** (estratégico/futuro) — depende do contexto de negócio.
- **Esforço**: S = dias, M = semana, L = ≥ 1 sprint.

---

## Categoria A — Gaps de PRODUTO (features do domínio)

### A.1 Reply-to-review flow 🔴 P0

**Observação:** o schema `reviews.reply_text` é read-only. Nenhuma rota backend POST/PATCH para publicar reply. A Google Business Profile API suporta `accounts.locations.reviews.updateReply`, e se o time do Cartório já autoriza o worker a ler reviews, provavelmente pode responder também.

**Por que é P0:** monitorar sem responder é meio produto. O ROI óbvio de um dashboard assim é acelerar e padronizar respostas — hoje o time provavelmente responde via Google Business Profile (app ou web), perdendo contexto analítico.

**O que implementar:**
- Backend: `PATCH /api/v1/reviews/{review_id}/reply` aceitando `{ body: str }`, rate-limit por usuário, audit log, chamada ao Google Reply API via service account do worker
- Frontend: `ReviewDetailDialog` ganha textarea + "Publicar resposta" + preview da resposta existente (se houver), estado de loading/success/erro
- Workers: job async para publicar (Google API pode rate-limit), retry com backoff
- Métricas: `/metrics/reply-queue` — reviews sem reply nos últimos 7 dias

**Risco:** requer permissão da conta Google Business Profile + service account com escopo de escrita. O Senhor precisa confirmar essa autorização.

### A.2 Fila de reviews não-respondidos + time-to-reply 🔴 P0

**Observação:** hoje o `/reviews` lista paginada por data. Não há filtro "pendente de resposta" nem métrica "tempo médio de resposta".

**Por que é P0:** operacionalmente, é O que o gerente do cartório quer ver todo dia: "quais reviews pedem atenção hoje e quanto demoramos para responder". Sem isso, o dashboard é um relatório passivo.

**O que implementar:**
- Backend: filter param `has_reply=false` em `/reviews/`; novo endpoint `/metrics/reply-stats?date_from=&date_to=` retornando `{ avg_hours_to_reply, median, p95, pending_count }`
- Frontend: preset "Sem resposta" no filtro de Reviews; card KPI "Tempo Médio de Resposta" no Dashboard + Analytics; badge no card quando `pending_count > 5`

**Risco:** baixo. Mudança aditiva.

### A.3 Tags/categorias manuais + notas internas 🟠 P1

**Observação:** reviews têm `sentiment` automático, mas não há como taggear operacionalmente ("atendimento", "tempo de espera", "documentação incompleta") nem adicionar notas internas ("cliente já contatado por telefone").

**Por que é P1:** permite triagem por tema, facilita relatórios trimestrais ("30% das reclamações de Q1 foram sobre tempo de espera"), e separa contexto operacional interno do reply público.

**O que implementar:**
- Nova tabela `review_tags` (review_id, tag_name, created_by, created_at) — muitos-para-muitos
- Nova tabela `review_notes` (review_id, body, author_id, created_at) — notas internas append-only
- Endpoint CRUD: `POST /reviews/{id}/tags`, `DELETE /reviews/{id}/tags/{tag}`, `POST /reviews/{id}/notes`
- UI: chips de tags no card de review, botão "Adicionar nota", filtro por tag na listagem

**Risco:** moderado. Requer migração de schema.

### A.4 Saved views / smart filters 🟠 P1

**Observação:** os filtros de Reviews são URL-state mas o usuário precisa reconfigurar a combinação cada vez ("1-estrela, últimos 7 dias, sem resposta, colaborador X").

**Por que é P1:** produtividade diária. Save as "Minha fila matinal" e reusa.

**O que implementar:** localStorage-backed saved views, dropdown no topo da página `/reviews`. Sem backend.

**Risco:** baixo. Pure frontend.

### A.5 Export relatório mensal PDF 🟠 P1

**Observação:** CSV existe para colaboradores, mas não há export de dashboard/analytics. Gerente provavelmente faz screenshot.

**Por que é P1:** relatórios mensais para direção do cartório. Um PDF bonito com KPIs do mês, top menções, distribuição de notas e comentários destacados é um "send button" poderoso.

**O que implementar:**
- Backend: endpoint `/api/v1/reports/monthly.pdf?date_from=&date_to=` gerando PDF via Playwright headless (renderiza uma rota dedicada `/reports/monthly?...` e screenshot-prints) ou WeasyPrint a partir de template Jinja
- Frontend: botão "Baixar relatório PDF" no header do Dashboard, abrindo window.location.href para o endpoint

**Risco:** moderado. PDF generation é sempre mais trabalhoso do que parece.

### A.6 Search fulltext em comentários 🟡 P2

**Observação:** `/reviews/` aceita `search: str` mas provavelmente é `ILIKE '%term%'` (lento em 5k+ linhas). Não há `tsvector`.

**Por que é P2:** útil mas não bloqueante. `ILIKE` funciona bem até ~10k reviews.

**O que implementar:** coluna `tsvector` generated em `reviews.comment` + índice GIN + `websearch_to_tsquery`. Migration pequena, sem breaking.

---

## Categoria B — Automação e alertas (cobertos pela Fase 4)

### B.1 Coleta automática de Google Reviews 🔴 P0 — ✅ Fase 4

**Observação:** `workers/app/cron.py` é stub vazio. Coleta provavelmente é manual hoje (explica "Dados de 04 de mar" em 14/abr — 40 dias de lag).

**Por que é P0:** o produto todo depende de dados frescos. 40 dias de lag torna o dashboard inútil para operação.

**Status:** Fase 4 promete `collect_reviews` via arq cron com cadência 1h. **Deve ser priorizada antes das features P1 abaixo.**

**Recomendação da mãe:** bloquear qualquer feature nova até Fase 4 entregar. Sem coleta automática, o resto é decoração.

### B.2 Alertas em 1-estrela nova 🟠 P1 — ✅ Fase 4 (parcial)

**Observação:** Fase 4 menciona "task arq que envia e-mail Resend se job_runs não tem sucesso há >2h". Isso é health alerting, não business alerting.

**Por que é P1:** quando chega 1-estrela pública, cada minuto de delay pesa. Alerta em tempo real permite resposta rápida e proativa.

**Recomendação:** expandir Fase 4 para incluir business alerting — hook no `collect_reviews` que detecta reviews novas com `rating <= 2`, enfileira `send_alert` (e-mail + opcional Slack webhook).

**Risco:** baixo.

---

## Categoria C — Qualidade de engenharia

### C.1 axe-core automated a11y tests 🟠 P1

**Observação:** Fase 3.8 melhorou a11y manualmente (aria-labels, skip link, semantic HTML). Zero testes automatizados. Calendar ainda tem `aria-label="Go to the Previous Month"` em inglês (confirmado via Playwright neste session).

**Por que é P1:** a11y sem automação regride. Uma nova PR pode quebrar sem nenhum sinal vermelho.

**O que implementar:**
- `vitest-axe` em vitest para componentes atômicos
- `@axe-core/playwright` nos E2E para páginas completas
- CI gate: zero violações novas em cada PR
- Corrigir calendar PT-BR (provavelmente `react-day-picker` tem locale config)

**Risco:** baixo. Setup isolado.

### C.2 OpenAPI client generation 🟠 P1

**Observação:** `frontend/src/lib/api/*.ts` é handwritten. FastAPI já emite `openapi.json`. Drift entre Pydantic schema e TS types é inevitável — vimos isso na Fase 3.8 com `TrendsData.granularity?` aditivo.

**Por que é P1:** elimina uma classe inteira de bugs. Mudança de schema no backend falha o build do frontend em CI, sem esperar runtime.

**O que implementar:**
- `openapi-typescript` ou `orval` para gerar `frontend/src/lib/api/generated.ts`
- Substituir imports de types manuais por generated
- CI step: regenerar e diffar

**Risco:** moderado. Requer uma varredura cuidadosa de consumers para não quebrar.

### C.3 Lighthouse CI + performance budget 🟡 P2

**Observação:** sem baseline de perf. Não sei qual é o LCP do Dashboard com daily granularity + 60 buckets.

**Por que é P2:** preventivo. Performance regride silenciosamente.

**O que implementar:** `lhci autorun` em CI, budgets em `lighthouserc.json` (LCP < 2.5s, CLS < 0.1, TBT < 200ms). Falha CI se regride.

### C.4 Visual regression (Chromatic/Percy) 🟡 P3

**Observação:** Storybook nem existe; sem baseline visual. Atualizações de shadcn/ui podem mudar aparência silenciosamente.

**Por que é P3:** útil mas caro de manter. Só justifica quando o time tem >2 pessoas no frontend.

### C.5 Storybook 🟡 P3

**Observação:** componentes em `components/ui/` e `components/charts/` sem documentação visual catalogada. Onboarding de novos devs leva mais tempo.

**Por que é P3:** nice-to-have. Só justifica se o time crescer.

---

## Categoria D — Operações e compliance

### D.1 Backup Postgres automatizado + drill de restore 🔴 P0 — ✅ Fase 5

**Observação:** Supabase Free tier faz backup interno, mas **não há estratégia explícita de restore drill**. "Temos backup" sem validação é `undefined behavior`.

**Por que é P0:** sem drill, backup é teatro. Regra de ouro: backup que nunca foi restaurado não existe.

**Recomendação:** Fase 5 deve incluir:
1. Task arq semanal `pg_dump` → Supabase Storage `backups/YYYY-MM-DD.sql.gz`
2. Drill manual mensal: restore em staging, comparar `COUNT(*)` por tabela crítica
3. Retenção 90 dias mínimo (LGPD)

### D.2 Runbook de incidente 🟠 P1 — ✅ Fase 5

**Observação:** sem playbook para "sync job parou", "backend 500 em /trends", "alguém deletou todos os collaborators". Incidente = descoberta ao vivo.

**O que implementar:** `docs/runbook.md` com 5-8 cenários comuns + comandos de mitigação + quem acionar + SLA interno. Um arquivo. Simples.

**Risco:** zero.

### D.3 LGPD — right-to-delete + export DPO 🟠 P1 — ✅ Fase 5

**Observação:** nenhum endpoint para deletar reviewer PII de uma pessoa específica (nome, avatar_url) nem para exportar dados de um usuário. A LGPD exige ambos em até 15 dias do pedido.

**O que implementar:**
- `POST /admin/lgpd/delete-reviewer` — anonimiza nome/avatar mantendo review + metrics
- `GET /admin/lgpd/export/{user_id}.json` — dump JSON de tudo associado ao user
- Log em `audit_log` ambos com razão LGPD

**Risco:** regulatório — fazer errado é pior que não fazer.

### D.4 Uptime probe externo 🟠 P1 — ✅ Fase 5

**Observação:** Railway tem restart-on-failure, mas sem probe externo ninguém sabe se o dashboard ficou inacessível (DNS, Cloudflare, Railway outage).

**O que implementar:** probe gratuito UptimeRobot ou Better Uptime pingando `/api/v1/health` a cada 60s, alerta e-mail se 2 falhas consecutivas.

**Risco:** zero. 10 minutos de config.

---

## Categoria E — UX polish

### E.1 Keyboard shortcuts 🟡 P2

Cmd+K (palette), `/` (focus search), `j`/`k` (navigate rows), `esc` (close modal). Padrão moderno (Linear, Notion, GitHub). Time interno adora.

### E.2 Breadcrumbs 🟡 P3

Principalmente em `/collaborators/{id}` e eventual detalhe de review. Baixo valor porque navegação é plana.

### E.3 Empty states audit 🟡 P2

Cada tabela/chart precisa de um estado vazio dedicado (já vi "Classificação pendente" no E-notariado KPI). Fazer um sweep: Reviews sem resultado, Top Mencionados com 0 colaboradores, chart sem dados.

### E.4 Dark mode 🟡 P3

Baixo valor para o domínio (cartório usa em hora comercial, luz do escritório). P3 por conveniência.

### E.5 Notificação in-app de novidades 🟡 P3

Badge no ícone de "Avaliações" quando há reviews novas desde última visita do usuário. Requer `last_seen_at` per user.

### E.6 Anotações / reações rápidas em reviews 🟡 P2

"Marcar como revisado", "Aprovado para resposta", "Escalar ao gerente". Botões de 1-click. Elimina fricção diária.

---

## Categoria F — Estratégicos (P3, futuros)

### F.1 Multi-location UX

Schema tem `location_id` e baseline foi consolidado para `cartorio-paulista-location`. Se o grupo tem múltiplas unidades (Moema, Pinheiros, etc), precisaria de um location switcher. **Depende inteiramente do modelo de negócio — pergunta para o Senhor.**

### F.2 Competitor benchmarking

Scrape do Google Business Profile dos cartórios competidores (Bueno, Registrocivil, etc) e mostrar comparativo de nota média. **Tecnicamente viável, legalmente incerto — consultar DPO.**

### F.3 AI reply suggestions

LLM lê o review + histórico de replies do cartório e sugere uma resposta no tom da casa. Usuário revisa antes de publicar. **Alto valor mas requer IA paga — configurar budget e guardrails.**

### F.4 Topic modeling em comentários

BERTopic ou LDA rodando mensalmente, descobre clusters de temas ("tempo de espera", "atendimento rude", "documentação incompleta") e plota evolução. Útil para relatórios de qualidade.

### F.5 Dashboard público/embed

Um `/public/snapshot?token=xxx` que renderiza uma versão read-only do Dashboard sem login — para diretoria, investidores, site institucional. Requer JWT sem cookie.

---

## Recomendação de sequenciamento

Se o Senhor me der autonomia para reordenar o roadmap:

**Bloco 1 — "Destravar o valor" (próximos 2-3 ciclos):**
1. **Fase 4 executada** (coleta automática + alertas básicos) — bloqueante para todo o resto
2. **A.1 Reply flow** — destrava o valor principal do produto
3. **A.2 Reply queue + time-to-reply** — completa o loop operacional

**Bloco 2 — "Operar com confiança" (1-2 ciclos):**
4. **C.1 axe-core** — trava a11y regressão
5. **C.2 OpenAPI gen** — trava type drift
6. **D.1 Backup drill** (Fase 5 parcial)
7. **D.2 Runbook** (1 arquivo)
8. **D.4 Uptime probe** (trivial)
9. **A.4 Saved views** — low-hanging fruit de produtividade

**Bloco 3 — "Refinar o produto" (1-2 ciclos):**
10. **A.3 Tags + notas internas**
11. **A.5 Export PDF mensal**
12. **E.1 Keyboard shortcuts**
13. **E.3 Empty states polish**
14. **D.3 LGPD** (obrigatório)

**Bloco 4 — "Estratégicos" (quando fizer sentido):**
15-22. Os P3 conforme o negócio demandar.

---

## Riscos não-endereçados no roadmap atual

Três coisas que eu destacaria ao Senhor:

1. **Falta de drill de restore** — o backup existe no papel mas não existe na prática enquanto não foi testado. Recomendo incluir no próximo ciclo, mesmo que pequeno.

2. **Sem plano de escala do worker** — se a coleta de Google Reviews ficar 30 min, o arq single-replica trava a fila. Fase 4 precisa pensar em dedupe + concorrência.

3. **Dependência do Google Business Profile API sem fallback** — se o Google revoga o token ou a conta vence, o produto para. Vale um monitor de token + reminder antes de expirar.

---

## Perguntas em aberto para o Senhor

Para o roadmap poder ser confirmado, preciso de 5 respostas:

1. **Quantas localizações o Cartório Paulista tem?** (informa F.1)
2. **O time responde reviews via app do Google ou via dashboard oficial web?** (informa prioridade de A.1)
3. **Há orçamento para IA paga (LLM reply suggestions, topic modeling)?** (informa F.3 e F.4)
4. **Há DPO definido e processo LGPD ativo?** (informa D.3)
5. **Fase 4 (coleta automática) já tem owner e data de início?** (informa bloqueio das features A.1-A.5)

---

*"Um backlog sem prioridades é um desejo. Com prioridades e rationale, vira plano."*
