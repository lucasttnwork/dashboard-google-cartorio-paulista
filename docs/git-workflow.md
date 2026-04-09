# Git Workflow

> Este projeto segue **GitHub Flow**, adaptado para um monorepo multi-serviço
> (frontend Vite + backend FastAPI + workers arq) com deploy contínuo em
> Railway. O objetivo é histórico linear, rastreabilidade por commit atômico,
> e PRs como unidade de revisão e deploy.

---

## Modelo de branches

| Branch | Papel | Regras |
|---|---|---|
| `main` | **Tronco único.** Sempre deployable. Toda mudança vai para produção. | Protegida. Sem push direto (use PRs). História linear. |
| `feature/<slug>` | Nova funcionalidade de produto | Curta (≤ 5 dias). Parte de `main`, volta via PR. |
| `fix/<slug>` | Correção de bug | Curta. PR obrigatório. |
| `chore/<slug>` | Refatoração, manutenção, deps, build | Curta. PR obrigatório para mudanças não-triviais. |
| `docs/<slug>` | Só documentação | Curta. PR ou push direto em mudanças isoladas. |
| `test/<slug>` | Só testes ou infraestrutura de teste | Curta. |
| `experiment/<slug>` | Branch descartável de experimentação | Nunca mergeada. Pode ser deletada sem cerimônia. |

**Nomenclatura:** `<prefixo>/<slug-kebab-case>` — ex.: `feature/auth-login`,
`fix/health-check-ipv6`, `chore/upgrade-vitest-3`.

## Branches proibidas

- `develop`, `release/*`, `hotfix/*` — não usamos Git Flow clássico.
- Nomes genéricos: `dev`, `work`, `tmp`, `wip`.
- Branches de longa duração além de `main`.

---

## Ciclo de vida de uma mudança

```
1. git checkout main && git pull --ff-only
2. git checkout -b feature/<slug>
3. commit frequente, commits atômicos, mensagens Conventional Commits
4. git push -u origin feature/<slug>
5. abrir PR para main (pode ser draft PR cedo)
6. revisão (mesmo solo: self-review explícito na PR)
7. CI verde obrigatório (quando Phase 5 habilitar)
8. merge via squash OU rebase-merge (nunca merge commit para PRs de 1-3 commits)
9. deletar a branch após merge (local e remoto)
10. git checkout main && git pull --ff-only
```

## Política de merge

| Situação | Estratégia |
|---|---|
| PR de 1 commit bem formado | **Rebase-merge** (preserva o commit original) |
| PR de 2–10 commits atômicos coerentes | **Rebase-merge** (histórico linear, commits separados) |
| PR de N commits exploratórios, ruído, WIP | **Squash-merge** (1 commit final limpo) |
| Branch de planejamento/execução com commits granulares que contam uma história | **Rebase-merge** (preserva a cronologia) |

**Nunca** use merge commit (`--no-ff`) neste projeto. Histórico linear é um
requisito para facilitar bisect, blame e log de auditoria.

---

## Conventional Commits

Formato obrigatório para mensagens de commit:

```
<tipo>(<escopo opcional>): <descrição em letras minúsculas, imperativo, ≤ 72 chars>

[corpo opcional em parágrafos, citando o porquê]

[footer opcional: BREAKING CHANGE, Refs, Co-Authored-By]
```

Tipos permitidos:

| Tipo | Uso |
|---|---|
| `feat` | Nova feature voltada ao usuário |
| `fix` | Correção de bug |
| `chore` | Infra, build, deps, housekeeping |
| `docs` | Documentação apenas |
| `test` | Testes apenas (criação ou correção) |
| `refactor` | Reestruturação sem mudança de comportamento |
| `perf` | Ganho de performance |
| `style` | Formatação (sem impacto funcional) |
| `ci` | Pipelines, workflows, hooks |
| `build` | Build system, bundler, Dockerfile |

Escopos sugeridos: `backend`, `frontend`, `workers`, `infra`, `supabase`,
`planning`, `scaffolds`, `ci`, `deps`, `docs`, nome da fase (`phase-0`,
`phase-1`, etc.).

**Commits atômicos.** Um commit deve ser revertível sem quebrar nada. Um
commit deve contar uma história em uma linha de título.

---

## Tags e releases

Tags semver para marcar estados notáveis:

- `v0.0.<phase>-<phase-name>-done` — ao final de cada fase do rebuild.
- `v<major>.<minor>.<patch>` — após a Fase 5 (lançamento enterprise completo).
- `archive/<descricao>-<YYYY-MM-DD>` — tags de arquivo para preservar
  estados legados que seriam perdidos por reset/rebase.

Tags são anotadas (`git tag -a`) com mensagem explicativa.

---

## Branches arquivadas em 2026-04-09

Durante o início do enterprise rebuild, três linhas de desenvolvimento
legadas foram arquivadas como tags e removidas como branches:

| Tag | Origem | Conteúdo |
|---|---|---|
| `archive/legacy-main-2026-04-09` | `origin/main` @ `08898dd` | Next.js 15 + Railway config pre-rebuild |
| `archive/legacy-new-dashboard-clean-2026-04-09` | `origin/new-dashboard-clean` @ `8f80721` | "Novo começo limpo" intermediário |
| `archive/legacy-full-new-2026-04-09` | `origin/full-new` @ `2d65f58` | Primeira tentativa de sistema completo |

Recuperação de qualquer estado legado:

```bash
git checkout archive/legacy-main-2026-04-09
# inspeciona, copia o que precisar, volta
git checkout main
```

---

## Regras de push

- `main`: nunca `push --force`. Se você precisar reescrever main, use
  `push --force-with-lease` e alinhe com o time primeiro. Neste projeto
  (solo + agente), só o Senhor autoriza `--force-with-lease` em main.
- `feature/*`, `fix/*`, `chore/*`: `push --force-with-lease` é aceitável
  durante rebase interativo, antes de pedir review.
- `archive/*` tags: push uma única vez, nunca sobrescrever.

## Regras de pull

Sempre `git pull --ff-only` em `main`. Se divergir, investigue — nunca
aceite merge commit silencioso.

```bash
# ~/.gitconfig (recomendado)
[pull]
    ff = only
[rebase]
    autoStash = true
```

---

## PR template

Todo PR usa o template em `.github/pull_request_template.md`. Seções:
contexto/motivação, mudanças, como testar, screenshots se UI, checklist.

## Branch protection (a configurar)

Quando a Fase 5 habilitar CI, configurar no GitHub:

- Require pull request before merging
- Require status checks (CI verde)
- Require linear history
- Include administrators
- Restrict force pushes (exceto admin com `--force-with-lease`)
- Restrict deletions
