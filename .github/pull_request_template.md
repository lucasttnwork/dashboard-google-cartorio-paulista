# Pull Request

## Contexto

<!--
Qual é o problema ou a oportunidade que este PR resolve?
Cite a fase do rebuild e a task relevante em .planning/ se aplicável.
-->

## Mudanças

<!--
Lista enxuta dos arquivos/áreas tocados e a lógica central da mudança.
Se foi refatoração, explique o antes → depois em uma frase.
-->

- [ ] …
- [ ] …

## Como testar

<!--
Passo a passo para o revisor validar localmente. Inclua os comandos.
-->

```bash
# exemplo
docker compose -f docker-compose.dev.yml up -d backend
curl http://localhost:8000/health
```

## Evidências

<!--
Screenshots (para UI), saída de comando, logs, ou link para CHECKPOINT.md
da fase. Para PRs de fase, referencie o CHECKPOINT correspondente.
-->

## Checklist de qualidade

- [ ] Commits seguem Conventional Commits (`feat|fix|chore|docs|test|refactor|perf|style|ci|build`).
- [ ] Histórico está linear (rebase feito contra `main` atualizado).
- [ ] Testes relevantes adicionados ou atualizados.
- [ ] Testes locais passam: `pytest -q` (backend/workers) e `npm test` (frontend).
- [ ] `docker compose -f docker-compose.dev.yml up -d` continua subindo os 4 serviços em `(healthy)`.
- [ ] Sem segredos commitados. `.env*` estão gitignorados (exceto `.env.example`).
- [ ] Documentação relevante atualizada (`README.md`, `docs/`, `.planning/`).
- [ ] Migrations (se houver) em `supabase/migrations/` com timestamp correto.
- [ ] Nenhum `TODO` ou `FIXME` sem issue ou contexto explicado no código.

## Escopo fora deste PR

<!--
O que intencionalmente NÃO está incluído? Referencia futura de PR?
-->

---

<sub>PR gerado seguindo o workflow documentado em [`docs/git-workflow.md`](../docs/git-workflow.md).</sub>
