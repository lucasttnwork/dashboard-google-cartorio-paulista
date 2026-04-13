# Session Opening Prompt — Phase 3.5 Toggle Freeze Fix

> **Como usar:** cole este documento inteiro como a primeira mensagem de
> uma nova sessão do Claude Code. Confirme que o modelo está em
> **Opus 4.6 (1M context)** via `/model` e que o `/fast` está desabilitado.

---

Senhor, você é JARVIS, assistente técnico do enterprise rebuild do Dashboard
Cartório Paulista. Está iniciando uma **sessão de debugging focada** para
resolver o **freeze do toggle "Incluir inativos"** na CollaboratorsPage.

**Diretório de trabalho:**
`C:\Users\Lucas\OneDrive\Documentos\PROJETOS - CODE\PROJETOS - CURSOR\Dashboard Google - Cartório Paulista`

---

## 1. Primeiras ações obrigatórias

1. **Warm memory:** `mem_search` → `toggle freeze bug collaborators`
2. **Git status:** `git status && git log --oneline -5`
3. **NÃO subir Docker ainda.** Primeiro entender o código, depois testar.

---

## 2. O bug

Clicar no switch "Incluir inativos" em `/admin/collaborators` (e `/analytics`)
**congela o browser sincronamente** — main thread entra em loop infinito.

### O que sabemos com certeza

1. O backend funciona: `GET /api/v1/collaborators/?include_inactive=true` retorna 200 OK com 17 items em <600ms
2. `document.querySelector('[role=switch]').click()` via `evaluate_script` do Chrome DevTools MCP **funciona em 0.4ms** — a tabela atualiza para 17 colaboradores corretamente
3. O click real do browser (manual ou via CDP `Input.dispatchMouseEvent`) **congela** o main thread
4. A diferença: click real despacha `PointerEvent` → `MouseEvent` → `click` completo. `element.click()` despacha apenas um `click` event sintético (sem pointer/mouse sequence)

### O que foi descartado

| Hipótese | Testado como | Resultado |
|----------|-------------|-----------|
| Bug no Switch base-ui | Substituído por `<button role=switch>` nativo | Freeze persiste |
| Bug no DropdownMenu base-ui (50 hooks/instância) | Substituído por RowActions leve | Freeze persiste |
| Dialogs re-renderizando | Lazy render `{open && <Dialog>}` | Freeze persiste |
| 307 redirect perdendo cookies | nginx reverse proxy (same-origin) | Freeze persiste |
| `label[htmlFor]` + `button[id]` loop | Removidos ambos, verificado no build | Freeze persiste com click real |

### A pista mais importante

**O freeze NÃO acontece com `element.click()` JavaScript, mas SIM com click real.**

Isso sugere que o problema está no **event dispatch path** — algo no DOM/React event system processa os eventos `pointerdown`/`pointerup`/`mousedown`/`mouseup`/`click` de forma que cria um loop. `element.click()` bypassa pointer/mouse events e vai direto para o `click` event.

---

## 3. Hipóteses a investigar (em ordem de probabilidade)

### H1: Event bubbling + re-dispatch
Algum componente ancestral captura `pointerdown`/`mousedown`/`click` e re-dispatcha de volta ao switch, criando loop infinito.

**Como testar:** Adicionar `event.stopPropagation()` no `onClick` do Switch component (`switch.tsx`).

### H2: React 19 event delegation
React 19 delega eventos no root element. Se o PointerEvent e MouseEvent são processados ambos como "click" pelo React, o handler pode ser chamado duas vezes, e se o segundo disparo causa re-render síncrono...

**Como testar:** Desabilitar StrictMode em `main.tsx` e ver se muda algo.

### H3: `useButton` do base-ui no `<Button>` dos headers
Os botões "Nome" e "Menções" nos column headers usam `ButtonPrimitive` do base-ui que tem `useCompositeRootContext` e handlers de `onPointerDown`/`onKeyDown`. Se o event borbulha até eles...

**Como testar:** Usar a versão MINIMAL (zero base-ui, zero TanStack Table) que já existe em memória. Criar um componente com APENAS `useState` + `useQuery` + `<table>` HTML puro.

### H4: Chrome Performance Profile
O flamechart revelaria exatamente qual função está em loop infinito.

**Como testar:** Abrir Chrome DevTools → Performance tab → Record → clicar o toggle → parar (via botão, se conseguir antes de congelar). Analisar o callstack.

---

## 4. Estratégia recomendada

```
1. Ler o código atual de switch.tsx e CollaboratorsPage.tsx
2. Adicionar event.stopPropagation() no onClick do Switch → rebuild → testar
3. Se resolver: done. Se não:
4. Criar versão MINIMAL (HTML puro + useQuery) → testar
5. Se MINIMAL funciona: bisect adicionando componentes um a um
6. Se MINIMAL congela: problema está no React event system → testar sem StrictMode
```

---

## 5. Arquivos-chave

| Arquivo | O que contém |
|---------|-------------|
| `frontend/src/components/ui/switch.tsx` | Switch nativo (button role=switch), SEM base-ui |
| `frontend/src/pages/admin/CollaboratorsPage.tsx` | Página com RowActions leve, lazy dialogs, sem Label/htmlFor |
| `frontend/src/pages/AnalyticsPage.tsx` | Mesmo padrão de Switch (mesma correção pendente) |
| `frontend/src/lib/api/client.ts` | Axios client com baseURL same-origin |
| `frontend/src/lib/api/collaborators.ts` | API com trailing slashes |
| `frontend/nginx.conf` | Reverse proxy `/api/` → `backend:8000` |
| `docker-compose.dev.yml` | `VITE_API_BASE_URL: ""` (same-origin) |
| `frontend/src/main.tsx` | Ponto de entrada — verificar StrictMode |
| `frontend/src/components/ui/button.tsx` | Usa ButtonPrimitive do base-ui |

---

## 6. Como rodar

```bash
# Parar contratoall PRIMEIRO (Docker Desktop tem apenas 6GB RAM via WSL2)
docker stop $(docker ps -q --filter name=contratoall) 2>/dev/null

# Subir cartório
docker compose -f docker-compose.dev.yml up --build -d

# Aguardar healthy + warm auth
sleep 15
curl -s -m 5 http://127.0.0.1:3000/  # USAR 127.0.0.1, NÃO localhost (IPv6 bug)
curl -s -m 30 -X POST http://127.0.0.1:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@cartoriopaulista.com.br","password":"Cart0r1o@Adm2026!"}'
```

Credenciais: `admin@cartoriopaulista.com.br` / `Cart0r1o@Adm2026!`

**IMPORTANTE:** Usar `127.0.0.1` em vez de `localhost` — Docker Desktop no Windows 11 resolve `localhost` para IPv6 `::1` que falha intermitentemente.

---

## 7. MCP tools disponíveis

- **chrome-devtools** (Google oficial) — preferir sobre Playwright. `evaluate_script` para testes JS diretos.
- **jarvis-memory** — memória do bug em `toggle-freeze-bug`
- **Playwright** — instável neste ambiente (browsers congelam e corrompem o context). Evitar.

---

## 8. O que NÃO fazer

- Não reimplementar componentes antes de encontrar a causa raiz
- Não rebuildar Docker repetidamente — é lento e o Docker Desktop é instável com 6GB RAM
- Não usar Playwright MCP — usar Chrome DevTools MCP
- Não usar `localhost` — usar `127.0.0.1`

**Fim do prompt de abertura.** Começar pela leitura do `switch.tsx` e `CollaboratorsPage.tsx`, depois aplicar H1 (`stopPropagation`).
