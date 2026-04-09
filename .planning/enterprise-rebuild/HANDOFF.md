# HANDOFF — Próxima Sessão

> Artefato estático para retomada de trabalho em sessão nova. Última atualização: 2026-04-09 (fim da sessão de planejamento).

---

## Status atual

**Planejamento COMPLETO (v2).** Implementação ainda não começou.

A próxima sessão executa a **Fase −1 (Cleanup & Architectural Pivot)**.

---

## Primeiras 5 ações de qualquer sessão neste projeto

1. **Warm memory** — rode `mcp__jarvis-memory__mem_context` (limit 20) e `mcp__jarvis-memory__query_documents` com "enterprise rebuild dashboard cartorio".
2. **Leia `MEMORY.md`** do auto-memory. Os arquivos `project_stack.md`, `project_phase_status.md`, `project_security_state.md`, `project_human_gates.md`, `reference_planning_docs.md`, `reference_supabase_connection.md`, `reference_methodology.md` serão carregados automaticamente se referenciados.
3. **Leia `.planning/enterprise-rebuild/README.md`** para ter o índice navegável.
4. **Leia na ordem:** `CONSTITUTION.md` → `OVERVIEW.md` → SPEC e TASKS da fase ativa.
5. **Confirme com o Senhor:** "Senhor, memória carregada. A fase ativa é [X]. Posso prosseguir com a task [Y]?"

**NÃO** refaça planejamento, auditoria ou decisões arquiteturais. Tudo está escrito.

---

## Credenciais necessárias na próxima sessão

- **`SUPABASE_ACCESS_TOKEN`** — o Senhor precisa fornecer no início (formato `sbp_*`). Não foi persistido em memória por segurança. Coloque em env var local ou cole no primeiro prompt. Foi fornecido na sessão de 2026-04-09.
- **Nada mais precisa ser digitado** — as chaves `sb_publishable_*` e `sb_secret_*` vivem em arquivos locais não commitados.

---

## Fase −1 — Cleanup & Architectural Pivot (a executar)

**Objetivo:** reorganizar o repositório para a nova stack (Vite+FastAPI+arq+Railway+Supabase Free). Arquivar o legado, criar scaffolding funcional dos 4 containers.

**Arquivos-guia:**
- `.planning/enterprise-rebuild/phase-minus-1-cleanup/SPEC.md` — spec completa SDD com 13 ACs
- `.planning/enterprise-rebuild/phase-minus-1-cleanup/TASKS.md` — 13 tasks (T−1.0 a T−1.12)

**Ordem das tasks:**
```
T−1.0 backup+branch
  └─ T−1.1 archive decorative docs
      └─ T−1.2 🧍 archive dashboard-frontend (encerra Next.js dev)
          └─ T−1.3 archive scraper/functions/scripts/execution/directives
              └─ T−1.4 clean root
                  ├─ T−1.5 [P] scaffold frontend Vite
                  ├─ T−1.6 [P] scaffold backend FastAPI
                  ├─ T−1.7 [P] scaffold workers arq
                  │    └─ T−1.8 glue files (docker-compose, railway.json)
                  │        └─ T−1.9 rewrite CLAUDE.md + README.md
                  │            └─ T−1.10 update .gitignore
                  │                └─ T−1.11 🧍 validate docker compose up
                  │                    └─ T−1.12 🧍 checkpoint + merge
```

**Gates humanos nesta fase:** T−1.2, T−1.11, T−1.12.

**Branch:** criar `chore/phase-minus-1-cleanup` a partir de `new-dashboard-clean`.

---

## O que NÃO fazer na próxima sessão

- Não revisitar decisões em `DESIGN-DISCUSSION.md`. Estão finais.
- Não tocar no Supabase produção nesta fase (só na Fase 0).
- Não rotacionar chaves legadas nesta fase (é T0.1, Fase 0).
- Não deletar nada sem antes arquivar em `legacy-snapshot/` ou `legacy-docs-archive/`.
- Não pular T−1.0 (backup mirror + branch).
- Não encerrar o dev server Next.js atual sem antes criar `dashboard-frontend.tar.gz` e verificar integridade.
- Não commitar `.env*` não `.example`.

---

## Contexto crítico (memorize antes de agir)

### Stack alvo (inviolável)
Frontend Vite+React → backend Python FastAPI → workers Python arq → Redis addon → Supabase Free (só banco + Auth). Tudo em containers Railway.

### Chaves JWT legadas ATIVAS em prod
Rotação é T0.1 da Fase 0, **não** nesta fase. Fase −1 só mexe em estrutura de arquivos.

### Sistema de coleta parado desde 2025-09-25
Não há cron externo ativo. Não há urgência operacional. Janela de manutenção é "agora".

### Snapshot real de produção
`.planning/enterprise-rebuild/phase-0-security-baseline/snapshot/prod-state-2026-04-09.md` é a fonte de verdade para o schema. O `init.sql` do repo está desatualizado em 9 tabelas.

### Decisões delegadas tomadas em 2026-04-09
- arq como task queue (descartados Celery, Dramatiq, APScheduler, rq)
- Supabase Auth como IdP via backend relay (não direto no browser)
- Backups `*_backup_cp`/`*_legacy_archive` → schema `archive` com RLS default-deny
- `location_id` canônico = `cartorio-paulista-location`
- 3 roles: admin/manager/viewer
- Budget zero adicional (Supabase Free + Railway Hobby + Sentry Free + Resend Free)

Ver `DESIGN-DISCUSSION.md` D1-D18 e `OPEN-QUESTIONS.md` Q1-Q10 para justificativas completas.

---

## Metodologia

- **SDD + CRISPY.** Instruction budget < 40 por prompt. Vertical planning. Artefatos estáticos em markdown.
- **Specs prontas, execute task por task.** Não reabrir decisões arquiteturais.
- **Commits atômicos por task.** Cada task = 1 commit.
- **Gates humanos 🧍 são mandatórios.** Parar e confirmar antes de prosseguir.
- **`mem_save` automático** ao aprender algo novo que futuras sessões se beneficiariam de saber.
- **Português formal** na comunicação com o Senhor. Inglês no código, commits, docs técnicas.
- **Operações destrutivas** exigem confirmação explícita.

---

## Primeiro comando executável

Após warm-up de memória e leitura dos docs, o primeiro comando é:

```bash
# T−1.0: commit do planejamento atual + branch + backup mirror
git add .planning/ CLAUDE.md supabase/.temp/
git status
# (revisar com o Senhor)
git commit -m "docs(planning): enterprise rebuild planning v2 complete"
git checkout -b chore/phase-minus-1-cleanup
git clone --mirror . ../dashboard-backup-before-cleanup-2026-04-09.git
```

Confirmar com o Senhor que T−1.0 está completo antes de iniciar T−1.1.
