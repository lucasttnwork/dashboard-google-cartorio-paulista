# Enterprise Rebuild — Planejamento (v2)

Reestruturação completa do Dashboard Cartório Paulista para atingir padrão enterprise-grade: segurança, observabilidade, automação, auditoria e qualidade de entrega.

**Stack alvo:** Vite + React (frontend) · FastAPI + SQLAlchemy async (backend) · arq + Redis (workers) · Supabase PostgreSQL + Auth (banco + IdP) · Railway (deploy) · tudo em containers Docker.

**Metodologia:** Spec-Driven Development (SDD) + CRISPY. Planejamento vertical, artefatos estáticos como memória compartilhada, instruction budget < 40 por prompt, human-in-the-loop nos gates.

**v2 (2026-04-09):** pivô arquitetural após decisão do Senhor. Backend migra de Next.js Route Handlers para Python/FastAPI em container Railway. Supabase reduzido a "só banco de dados + IdP". Next.js, Node.js backend e `scraper/` deletados. Nova Fase −1 (Cleanup & Architectural Pivot) criada.

---

## Estrutura

| Documento | Propósito |
|---|---|
| [CONSTITUTION.md](CONSTITUTION.md) | 13 artigos invioláveis (inclui Artigo IX-B com a stack canônica) |
| [OVERVIEW.md](OVERVIEW.md) | Visão estratégica das 7 fases + diagrama de arquitetura alvo |
| [DESIGN-DISCUSSION.md](DESIGN-DISCUSSION.md) | 18 decisões técnicas (D1-D18) com contexto e justificativa |
| [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) | Histórico das 10 perguntas originais — todas resolvidas em 2026-04-09 |
| [research/CURRENT-STATE-AUDIT.md](research/CURRENT-STATE-AUDIT.md) | Auditoria crítica do estado anterior |
| [research/SCHEMA-INVENTORY.md](research/SCHEMA-INVENTORY.md) | Inventário declarado em `init.sql` (vs. estado real no snapshot) |
| [phase-0-security-baseline/snapshot/prod-state-2026-04-09.md](phase-0-security-baseline/snapshot/prod-state-2026-04-09.md) | **Snapshot real de produção** via Management API |
| [phase-minus-1-cleanup/SPEC.md](phase-minus-1-cleanup/SPEC.md) | Spec SDD da Fase −1 (próxima a executar) |
| [phase-minus-1-cleanup/TASKS.md](phase-minus-1-cleanup/TASKS.md) | 13 tasks verticais com gates |
| [phase-0-security-baseline/SPEC.md](phase-0-security-baseline/SPEC.md) | Spec SDD da Fase 0 (v2, reescrita após pivô) |
| [phase-0-security-baseline/TASKS.md](phase-0-security-baseline/TASKS.md) | 11 tasks verticais com gates humanos |

---

## Fases

| # | Nome | Status | O que entrega |
|---|---|---|---|
| **−1** | Cleanup & Architectural Pivot | 🔜 próxima | Repositório reorganizado; scaffolding Vite+FastAPI+arq+Redis funcionando local |
| **0** | Security Baseline | spec pronta | Chaves legadas revogadas, RLS restritiva, backups arquivados, `location_id` consolidado, migrations versionadas, CI de segredos |
| **1** | Auth & Backend BFF | (spec depois da 0) | Supabase Auth como IdP, backend FastAPI com cookie httpOnly, middleware, role guards, login page |
| **2** | Collaborators Admin Panel | (spec depois da 1) | CRUD + merge + aliases + audit log |
| **3** | Visualization Dashboard Refactor | (spec depois da 1) | Páginas de visualização consumindo o novo BFF, sem mocks silenciosos |
| **4** | Scraper Rebuild & Automation | (spec depois da 1) | Novo scraper Python + arq cron jobs + DataForSEO |
| **5** | Observability & Hardening | (spec depois das anteriores) | Sentry, runbooks, LGPD, backups, load tests |

Specs detalhadas das fases 1-5 serão escritas **após** a fase anterior ser concluída, para que cada uma aprenda com a realidade implementada.

---

## Estado atual (2026-04-09)

### ✅ Feito nesta sessão
- Planejamento v1 redigido (CONSTITUTION, OVERVIEW, DESIGN-DISCUSSION, OPEN-QUESTIONS, research, Phase 0 draft).
- Auditoria crítica do sistema anterior.
- Snapshot real do Supabase cloud via Management API (token fornecido pelo Senhor).
- Scrapers órfãos (`google-maps-scraper-tool/` 32 MB, `railway-collector/` 80 MB) deletados.
- Pivô arquitetural para Python/FastAPI/Railway com workers arq.
- Planejamento v2: constituição ajustada, OVERVIEW reescrito com 7 fases, DESIGN-DISCUSSION com 18 decisões, OPEN-QUESTIONS resolvidas, Phase −1 criada, Phase 0 reescrita.
- Dois testes confirmaram:
  - **Chaves legadas JWT estão ativas em prod** (ação #1 da Fase 0).
  - **Coleta parada há 6 meses** (simplifica janela de manutenção).

### 🔜 Próximo passo
1. O Senhor revisa os documentos atualizados:
   - `CONSTITUTION.md` (Artigo II reescrito + Artigo IX-B novo sobre stack)
   - `OVERVIEW.md` (v2 completo)
   - `DESIGN-DISCUSSION.md` (D1, D6, D7, D8, D9, D10, D12, D14 reescritos; D16, D17, D18 novos)
   - `phase-minus-1-cleanup/SPEC.md` e `TASKS.md`
   - `phase-0-security-baseline/SPEC.md` (v2) e `TASKS.md` (v2)
2. O Senhor aprova início da **Fase −1** (Cleanup & Architectural Pivot).
3. Execução da Fase −1 com gates humanos nos pontos marcados.

---

## Credenciais em uso nesta sessão (não persistidas em disco)

- **Supabase Access Token** (fornecido em 2026-04-09 pelo Senhor): `sbp_05e1d9fc8...` — usado apenas em env var in-memory para Management API e Supabase CLI. Jamais commitado.
- **Supabase project ref:** `bugpetfkyoraidyxmzxu`
- **Chaves novas (em uso):** `sb_publishable_x4ab0Pkf2...`, `sb_secret_KDjF3_2Wr3...`
- **Chaves legadas (a serem revogadas):** `eyJ...9qYGEj...` (anon), `eyJ...9584M85...` (service_role) — **confirmadas ativas em 2026-04-09**.

---

## Convenções

- **`.planning/`** é território de planejamento. Não afeta runtime. Versionado no git.
- **Idioma:** specs e planos em português brasileiro formal; código-fonte, commits e testes em inglês.
- **Tudo é vertical:** nenhuma fase entrega "só a migration" ou "só a UI". Cada fase entrega uma fatia testável end-to-end.
- **Mudar decisão arquitetural?** Edite `DESIGN-DISCUSSION.md`, marque com status `🔄 Revisado`, registre alteração no CONSTITUTION.md se for invariante, atualize o README.md.
- **Cada fase ganha um `CHECKPOINT.md`** durante a execução com commits, logs e ACs verificados.
