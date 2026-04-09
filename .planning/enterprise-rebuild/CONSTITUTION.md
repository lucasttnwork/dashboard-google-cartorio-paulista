# CONSTITUTION — Dashboard Cartório Paulista (Enterprise Rebuild)

> Documento normativo. Cada artigo é inviolável. Toda decisão técnica posterior — em design, specs, tasks, código — deve ser coerente com esta constituição. Alterações exigem registro explícito e novo ciclo de alinhamento com o Senhor.

---

## Preâmbulo

Este projeto deixará de ser um protótipo frágil e passará a ser um sistema de monitoramento e gestão enterprise-grade, capaz de operar de forma autônoma, segura e auditável, servindo o Cartório Paulista como fonte única de verdade sobre reviews do Google Business Profile e sobre o desempenho individual dos colaboradores.

Esta reestruturação não é um MVP. É uma entrega completa e sustentável.

---

## Artigo I — Enterprise-Grade, nunca MVP

Nenhuma funcionalidade será cortada, adiada ou degradada por complexidade. Todo sistema será entregue com observabilidade, testes, segurança, documentação e automação completos. "Simples o suficiente" é aceitável; "simplificado por preguiça" não é.

**Aplicação:** se um requisito parece "difícil demais para esta fase", escalar, reprovisionar infraestrutura ou dividir em subfases verticais — jamais removê-lo do escopo.

---

## Artigo II — Security-First, Zero Trust no Frontend

O frontend é território hostil. Nenhum segredo, nenhuma credencial de banco e nenhum privilégio de escrita direta ao banco pode residir no bundle do browser.

**Invariantes:**
- O frontend (Vite SPA) **nunca** fala diretamente com o Supabase para dados de negócio. A chave `anon`/`publishable` não é incluída no bundle do frontend.
- Toda leitura/escrita de dados passa pelo **backend FastAPI em container Railway**, autenticado via cookie httpOnly, que por sua vez fala com o Supabase usando `service_role` **apenas no lado do servidor**.
- `service_role` vive exclusivamente como variável de ambiente dos containers do backend e dos workers Railway. Jamais entra em qualquer artefato do frontend (build, runtime, env público).
- RLS habilitada em **todas** as tabelas com políticas RESTRICTIVE por padrão; tabelas sem RLS são consideradas bug crítico. RLS serve como defesa em profundidade caso uma credencial vaze.

---

## Artigo III — Autenticação Moderna e Credenciais Gerenciadas

Gestão de identidade deve seguir as boas práticas atuais:
- Senhas armazenadas exclusivamente como hash (bcrypt/argon2) — delegadas ao Supabase Auth.
- JWT transportado em **cookie httpOnly, Secure, SameSite=Lax**, nunca em `localStorage`.
- Refresh token com rotação e grace period de ~10s para abas múltiplas.
- MFA (TOTP) disponível como feature flag por usuário.
- Rate limiting e account lockout após tentativas inválidas.
- Reset de senha por e-mail com token de uso único expirando em 15 min.
- Convite de novos usuários apenas por admin (não há self-signup).

---

## Artigo IV — Segredos fora do Git, para sempre

Nenhuma chave, token, senha ou credencial entra no repositório — nem mesmo "legada, para referência".
- `.env*` no `.gitignore` sem exceções, exceto `.env.example` com placeholders.
- `.env.docker` commitado atualmente é **dívida crítica** — deve ser removido do tracking e do histórico, e as chaves correspondentes rotacionadas no console Supabase.
- Segredos de produção vivem em: (a) Supabase Secrets para Edge Functions, (b) variável de ambiente do host do frontend (Vercel/Railway), (c) gestor de segredos do scraper.
- Rotação periódica documentada em runbook.

---

## Artigo V — Schema Versionado e Determinístico

Toda mudança de schema é uma migration versionada, testada e reversível.
- Fonte única de verdade: `supabase/migrations/` com prefixo timestamp.
- `supabase/sql/` e `EXECUTE_ESTE_SQL.sql` são legado e serão eliminados após consolidação.
- Nenhum "fix manual via console SQL" sem commit correspondente. Se aconteceu, registrar em migration de correção.
- CI valida que `supabase db diff` está limpo contra as migrations antes de qualquer merge.

---

## Artigo VI — Automação como Primeira Classe

A coleta e o processamento de reviews não dependem de intervenção manual.
- Todo processo recorrente é disparado por cron (Supabase `pg_cron` acionando Edge Functions, ou alternativa equivalente documentada).
- Idempotência obrigatória: re-execução do mesmo job não duplica dados.
- Dead-letter queue + retry com backoff exponencial para falhas transitórias.
- Healthcheck + alerta automático quando um job não executa há mais de 2 ciclos consecutivos.

---

## Artigo VII — Observabilidade Obrigatória

Um sistema que falha em silêncio é indistinguível de um sistema saudável. Isto é inaceitável.
- Erros de frontend → Sentry (ou equivalente).
- Logs de Edge Functions → Supabase Logs + export diário para armazenamento de longo prazo.
- Scripts de scraping/processamento → logs estruturados JSON com correlation ID.
- Métricas de negócio (reviews coletados/dia, menções detectadas, latência do pipeline) expostas em dashboard operacional.
- Adapter do frontend **não** mascara falhas retornando dados mockados. Erro é propagado, exibido ao usuário e registrado.

---

## Artigo VIII — Test-First onde importa

Nenhum código crítico entra em produção sem teste automatizado que o valide.
- Endpoints de autenticação, RLS, e gates de autorização: testes de integração obrigatórios.
- Fluxos de usuário principais (login, visualizar reviews, gerenciar colaborador): E2E Playwright.
- Funções de transformação/agregação de dados: unit tests.
- Edge Functions: testes locais com Deno test.
- Cobertura mínima 70% nas camadas de auth, dados e regras de negócio. UI pode ter menos.
- Testes rodam em CI antes de merge.

---

## Artigo IX — Single-tenant hoje, multi-tenant amanhã

O sistema opera para um único cliente (Cartório Paulista), mas o schema e a arquitetura preservam a possibilidade de multi-tenancy futura via `location_id` (já presente). Hardcoding de `'cartorio-paulista-location'` em código de aplicação é proibido; usar variável de ambiente ou coluna de configuração.

---

## Artigo IX-B — Stack Canônica

A reestruturação converge em uma stack única e coesa. Desvios exigem alteração desta constituição.

- **Frontend:** Vite + React 19 + TypeScript 5 + TailwindCSS 4 + shadcn/ui + TanStack Query + React Router 7. Servido por nginx em container Railway.
- **Backend:** Python 3.12 + FastAPI + SQLAlchemy 2 async + Pydantic v2 + python-jose + passlib (se necessário). uvicorn + gunicorn em container Railway.
- **Workers:** Python + arq (async Redis queue) + arq cron jobs. Container Railway.
- **Broker / cache:** Redis addon Railway.
- **Database:** Supabase cloud PostgreSQL 16 (plano Free, apenas storage). Auth via Supabase gotrue como IdP. Sem uso de Edge Functions como runtime de aplicação, sem pg_cron.
- **Orquestração:** Railway (4 serviços + 1 addon). Deploy via Git + Railway.
- **CI/CD:** GitHub Actions (lint, type check, test, deploy trigger).
- **Observabilidade:** Sentry (Python + JS), structlog JSON em stdout, Railway Logs.
- **Migrations:** SQL versionado em `supabase/migrations/` aplicado via Supabase CLI.

---

## Artigo X — Português na Interface, Inglês no Código

Todas as interfaces visíveis ao usuário final (labels, mensagens, e-mails, documentação do produto) em português brasileiro formal. Código-fonte, identificadores, commits, comentários técnicos e documentação de engenharia em inglês. Specs e planos internos podem ser em português quando for mais eficiente para o Senhor.

---

## Artigo XI — Vertical sempre, Horizontal nunca

Planejamento e execução em fatias verticais end-to-end. Cada fase entrega algo testável de cabo a rabo, não uma camada isolada (todas as migrations, depois todas as APIs, depois toda a UI).

**Exemplo:** "Autenticação" é uma fatia vertical → migration de users/roles + Route Handlers de auth + página de login + middleware de guarda + teste E2E. Entregue como bloco único, testado como bloco único.

---

## Artigo XII — Human in the Loop

O Senhor é a autoridade final. Nenhuma decisão arquitetural relevante, nenhuma operação destrutiva, nenhuma rotação de credencial, nenhum deploy de produção acontece sem aprovação explícita.

Agentes auxiliares (subagents, scripts, automações) executam dentro de escopo pré-aprovado; fora dele, escalam para o Senhor.

---

## Registro de Alterações

| Data       | Versão | Mudança                                         | Autor     |
|------------|--------|-------------------------------------------------|-----------|
| 2026-04-09 | 1.0    | Constituição inicial                            | JARVIS    |
