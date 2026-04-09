# Session Handoff Template

> Template para o **prompt de abertura** de cada nova sessão do Claude Code.
> Toda fase do enterprise rebuild (e qualquer trabalho de médio porte) deve
> produzir um arquivo `SESSION-OPENING-PROMPT.md` seguindo este molde,
> commitado junto com o planejamento da fase.

---

## Por que este artefato existe

Sessões do Claude Code têm context window finito. Conversas longas consomem
janela rapidamente e comprometem a qualidade do raciocínio. A forma de escalar
trabalho complexo é dividi-lo em sessões, cada uma com contexto limpo.

Para que a nova sessão não precise reconstruir entendimento do zero, a sessão
que a antecede deixa um prompt de abertura **self-contained**: o novo agente lê
esse prompt, segue as referências para os artefatos estáticos, confirma com o
humano e começa a trabalhar.

Princípios (CRISPY + context engineering):

1. **Self-contained.** O novo agente não tem acesso ao histórico da conversa
   anterior. Tudo que ele precisa saber está no prompt ou nos arquivos que o
   prompt referencia.
2. **Aponta, não duplica.** O prompt referencia `SPEC.md`, `TASKS.md`,
   `CHECKPOINT.md`, `CLAUDE.md`, `CONSTITUTION.md`. Não copia conteúdo.
3. **Primeiras ações concretas.** As 5 primeiras ações da sessão estão
   escritas com comandos prontos.
4. **Gates humanos explícitos.** Toda parada obrigatória por aprovação humana
   aparece com o ícone 🧍 e um parágrafo dedicado.
5. **Budget instrucional.** Mantenha o prompt abaixo de ~450 linhas. Se
   estiver estourando, parte do conteúdo deveria estar em arquivos
   referenciados, não no prompt.
6. **Secret-safe.** Nunca coloque segredos reais no prompt. Push-protection
   do GitHub vai bloquear e forçar rework. Use placeholders (`<ROTATE_ME>`,
   `<set_in_railway>`).

---

## Quando criar / atualizar

| Quando | O que fazer |
|---|---|
| **Ao finalizar uma fase** (última task, antes do merge) | Criar o `SESSION-OPENING-PROMPT.md` da **próxima** fase em `.planning/enterprise-rebuild/<phase>/` |
| **Ao fechar uma sessão sem terminar a fase** (estouro de contexto, pausa) | Atualizar o prompt existente da fase corrente para refletir o estado atual (tasks concluídas, decisões novas, gotchas descobertas) |
| **Ao mudar decisões arquiteturais relevantes** | Atualizar o prompt de todas as fases ainda não iniciadas |

A criação do prompt da próxima fase é um **deliverable obrigatório** da fase
atual (aparece no checklist de "Deliverables esperados" do próprio prompt).

---

## Estrutura obrigatória (10 seções)

Seguir nesta ordem. Títulos em português formal. Tom: imperativo, direto,
sem enfeite.

### Cabeçalho

```markdown
# Session Opening Prompt — Phase <N> (<Phase Name>)

> **Como usar:** cole este documento inteiro como a primeira mensagem de
> uma nova sessão do Claude Code. Confirme antes que o modelo está em
> **Opus 4.6 (1M context)** via `/model` e que o `/fast` está desabilitado.
>
> **Template-mãe:** `docs/session-handoff-template.md`.

---

Senhor, você é JARVIS, assistente técnico do enterprise rebuild do Dashboard
Cartório Paulista. Está iniciando uma **nova sessão** com a missão de executar
a **Fase <N> — <Nome>** do planejamento já aprovado. A sessão anterior
finalizou a Fase <N-1> (<Nome anterior>), que já está mergeada em `main` com
a tag `v0.0.<N-1>-phase-<slug-anterior>`.

**Diretório de trabalho:**
`<absolute path local do repo>`
```

### § 1. Primeiras 5 ações obrigatórias

Sempre inclua:
1. Warm memory (`mem_context` + `query_documents` + `MEMORY.md`)
2. Leituras obrigatórias na ordem: `CONSTITUTION.md`, `OVERVIEW.md`,
   `SPEC.md` da fase, `TASKS.md` da fase, `snapshot/` relevante, `CHECKPOINT.md`
   da fase anterior.
3. Leitura de `docs/git-workflow.md` + `CLAUDE.md`.
4. Verificação de estado git (`status`, `log`, `branch -a`, `tag -l`).
5. Confirmação com o Senhor antes de prosseguir.

### § 2. Credenciais a fornecer

Liste o que o humano precisa ter à mão (tokens, senhas, acessos a consoles)
e **onde eles NÃO estão** (por segurança). Se não tiver, parar e pedir.

### § 3. Contexto crítico

Três subseções mínimas:
- **3.1 Stack (inviolável)** — uma frase referenciando `CLAUDE.md`.
- **3.2 Estado atual do sistema** — o que está vivo, o que está quebrado, o
  que foi confirmado em que data.
- **3.3 Referências externas** — endpoints, project refs, IDs, etc.

### § 4. Sequência das tasks da fase

Diagrama ASCII com a árvore de dependências. Gates humanos marcados com 🧍.
Logo abaixo, lista explícita dos gates humanos com contexto.

### § 5. Workflow git

Comandos prontos para criar a branch (`git checkout -b <prefix>/phase-<slug>`)
e regras desta fase (Conventional Commits, histórico linear, regras de
secret hygiene específicas se houver).

### § 6. Metodologia

SDD + CRISPY + instruction budget + vertical planning + artefatos estáticos
+ se paralelização com agent teams é apropriada nesta fase (e onde).

### § 7. Comandos úteis prontos

Bloco de shell com comandos copy-paste-friendly para as operações mais
repetitivas da fase.

### § 8. O que NÃO fazer

Lista de interdições específicas da fase. Sempre inclua:
- Não revisitar decisões arquiteturais.
- Não commitar `.env*` ou chaves reais.
- Não executar operações destrutivas sem autorização explícita.
- Restrições de escopo (não implementar o que é de fases futuras).

### § 9. Deliverables esperados

Checklist numerado dos artefatos que devem existir ao final da fase.
**Sempre inclua** como último item: "Prompt de abertura da fase seguinte
em `.planning/enterprise-rebuild/<next-phase>/SESSION-OPENING-PROMPT.md`
seguindo o template em `docs/session-handoff-template.md`."

### § 10. Primeiro comando executável

Um único bloco de shell com o primeiro comando real da fase. Geralmente o
comando que cria a branch de trabalho.

---

## Checklist antes de publicar o prompt

Antes de commitar o `SESSION-OPENING-PROMPT.md` da nova fase:

- [ ] Todas as 10 seções estão presentes.
- [ ] Nenhum segredo real aparece no prompt (grep por padrões `eyJ...`,
      `sbp_`, `sb_secret_`, `sb_publishable_[A-Za-z0-9]`).
- [ ] Todos os paths referenciados existem no repo no momento do handoff.
- [ ] O diagrama de tasks bate com o `TASKS.md` da fase (mesma numeração,
      mesmos gates).
- [ ] Os comandos de shell foram testados mentalmente (sem erros óbvios de
      sintaxe; paths absolutos quando necessários em Windows).
- [ ] O tamanho do arquivo está entre ~250 e ~450 linhas.
- [ ] A seção "Deliverables esperados" inclui a criação do prompt da fase
      seguinte.
- [ ] Tom formal, português brasileiro, tratamento "Senhor" preservado.

---

## Referências

- `docs/git-workflow.md` — workflow git que o prompt deve ensinar ao novo agente.
- `.planning/enterprise-rebuild/CONSTITUTION.md` — invariantes do projeto.
- `.planning/enterprise-rebuild/phase-0-security-baseline/SESSION-OPENING-PROMPT.md`
  — primeiro exemplo real deste template, escrito ao fim da Fase −1.
