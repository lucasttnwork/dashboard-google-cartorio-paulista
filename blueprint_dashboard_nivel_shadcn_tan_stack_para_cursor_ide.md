# Blueprint — Dashboard nível “Shadcn + TanStack”

> Guia completo e prescritivo para o Cursor IDE gerar dashboards modernos, escuros, elegantes e funcionais no padrão da referência visual enviada.

---

## 0) Resultado final esperado (visão rápida)

- **Layout:** Sidebar colapsável à esquerda + Topbar com busca (⌘K), seletor de tema e avatar. Conteúdo principal com **cards de KPIs**, **gráfico Area** com gradiente e **tabela avançada** com filtros, ordenação, paginação, seleção de colunas (“Customize Columns”).
- **Tema:** Dark mode padrão, com light alternável; tipografia legível; espaçamentos confortáveis; bordas `rounded-2xl` e sombras suaves.
- **Acessibilidade & DX:** Componentes acessíveis (Radix), TypeScript estrito, arquitetura modular, Storybook opcional, testes básicos.

---

## 1) Stack recomendada (e por quê)

- **Framework full‑stack:** **TanStack Start (React + Vite + SSR + server functions)**
- **UI:** **shadcn/ui** (sobre **Tailwind v4**) + **Radix UI**
- **Ícones:** **lucide-react**
- **Gráficos:** **Recharts** (via wrappers prontos do shadcn charts)
- **Tabela:** **@tanstack/react-table** integrada aos componentes Table do shadcn
- **Dados:** **@tanstack/react-query** para cache/fetch + adapters (REST/GraphQL/Supabase)
- **Estado leve:** **Zustand** (preferível) ou Context para preferências (ex.: colunas visíveis)
- **Validação:** **zod**; parse de datas: **date-fns**
- **Autenticação (opções):** Supabase Auth / Clerk / Lucia (escolher 1)
- **Qualidade de código:** ESLint + Prettier/Biome; Husky + lint-staged (opcional)

> **Alternativa**: Next.js 15 + shadcn/ui + TanStack Table/Query/Recharts mantém exatamente os mesmos módulos. Use esta rota apenas se o projeto exigir recursos específicos do Next.

---

## 2) Anatomia do UI (o que o Cursor deve gerar)

1. **AppShell**
   - Sidebar colapsável com nav groups (Dashboard, Lifecycle, Analytics, Projects, Team …)
   - Topbar: título/contexto, Command Menu (⌘K), ThemeToggle, perfil.
2. **Header KPIs** (4 cards)
   - Título, valor grande, variação (% ⬆︎/⬇︎), legenda curta.
3. **Área de gráficos**
   - **AreaChart** com gradiente suave, tooltips, tabs de período (Last 3 months / 30 days / 7 days).
4. **Tabela avançada**
   - Filtros, ordenação, paginação, seleção de linha, **visibilidade de colunas** e ação **“Customize Columns”** (Sheet/Popover + checkboxes).
5. **Pílulas de filtro** (Outline, Past Performance, Key Personnel, Focus Documents) usando **Tabs/ToggleGroup**.
6. Botões de ação (ex.: **Add Section**) e **Dialog/Sheet** para criação/edição.

---

## 3) Estrutura de pastas (TanStack Start)

```
app/
  routes/
    _layout.tsx            # AppShell (Sidebar + Topbar)
    index.tsx              # Dashboard (cards + gráfico + tabela)
    settings.tsx           # Exemplo
  components/
    shell/                 # AppShell + Sidebar + Topbar
    ui/                    # componentes do shadcn (gerados pela CLI)
    kpi/                   # CardKPI.tsx
    charts/                # AreaChart.tsx (wrapper Recharts)
    table/                 # DataTable.tsx, columns.ts
    command/               # CommandMenu.tsx (⌘K)
  lib/
    theme.ts               # Theme provider + next-themes-like (classe 'dark')
    utils.ts               # cn(), formatCurrency(), etc.
    queryClient.ts         # React Query client
    supabase.ts            # (opcional) cliente supabase-js
  store/
    use-ui.ts              # Zustand (ex.: sidebar aberta, colunas visíveis)
  styles/
    globals.css            # Tailwind base + tokens
  types/
    index.d.ts
  server/                  # server functions / loaders (se necessário)
```

---

## 4) Passo a passo — Setup (TanStack Start)

1. **Criar o projeto**
   - `pnpm create @tanstack/start@latest dashboard-app --tailwind`
   - Escolha TypeScript, Vite, ESLint/Prettier (ou Biome).
2. **Tailwind v4**
   - Confirmar `@tailwindcss/postcss` + `postcss` instalados.
3. **shadcn/ui**
   - Instalar CLI (`pnpm dlx shadcn@latest init`) e gerar componentes essenciais: `button`, `card`, `tabs`, `table`, `dialog`, `sheet`, `badge`, `toggle`, `dropdown-menu`, `input`, `label`, `select`, `separator`, `avatar`, `scroll-area`, `tooltip`, `command`.
4. **TanStack libs**
   - `pnpm add @tanstack/react-query @tanstack/react-table zustand zod date-fns lucide-react recharts`
5. **Providers**
   - No arquivo de **layout** raiz, envolver app com ThemeProvider, QueryClientProvider e ToastProvider.
6. **Tokens de tema**
   - Definir escala de cinzas e acentos (primário) no `:root` e `.dark`. (ver seção 5)
7. **Gerar wrappers**
   - `AreaChart` (Recharts) e `DataTable` (tanstack table + shadcn Table) conforme seções 6 e 7.

> **Se optar por Next.js**: replicar os mesmos passos; colocar providers em `app/layout.tsx`.

---

## 5) Tema e tokens (Tailwind + CSS vars)

```css
:root {
  --background: 18 18 18;        /* #121212 */
  --foreground: 230 230 230;     /* #E6E6E6 */
  --muted: 38 38 38;
  --card: 22 22 22;
  --border: 40 40 40;
  --primary: 147 92 246;         /* violeta */
  --primary-foreground: 255 255 255;
  --ring: var(--primary);
}
.dark {
  --background: 10 10 10;
  --card: 16 16 16;
  --border: 36 36 36;
}
```

Classes úteis nos componentes:

- Containers e cards: `rounded-2xl border bg-card text-foreground shadow-sm`
- Títulos KPI: `text-2xl md:text-3xl font-semibold tracking-tight`
- Valores KPI: `text-4xl md:text-5xl font-extrabold`
- Badges de variação: `inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5`

---

## 6) Componentes principais (código prescritivo)

### 6.1 AppShell (layout)

Responsável por **sidebar colapsável**, **topbar** (busca/⌘K, tema, avatar) e **slot** para conteúdo.

```tsx
// app/components/shell/app-shell.tsx
import { PropsWithChildren } from 'react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { CommandMenu } from '@/components/command/command-menu'
import { Sidebar } from '@/components/shell/sidebar'

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-dvh bg-background text-foreground grid grid-cols-[auto_1fr]">
      <Sidebar />
      <div className="flex flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b bg-background/80 backdrop-blur px-4">
          <CommandMenu />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {/* Avatar/Menu usuário */}
          </div>
        </header>
        <main className="p-4 md:p-6 space-y-6">{children}</main>
      </div>
    </div>
  )
}
```

### 6.2 CardKPI

```tsx
// app/components/kpi/card-kpi.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function CardKPI({ title, value, delta, hint }: { title: string; value: string; delta?: string; hint?: string }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-4xl font-extrabold tracking-tight">{value}</div>
        {delta ? (
          <div className="text-xs text-muted-foreground">{delta}</div>
        ) : null}
        {hint ? <p className="text-xs text-muted-foreground/80">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}
```

### 6.3 Área de gráfico (Recharts wrapper)

```tsx
// app/components/charts/area-chart.tsx
import { AreaChart as RArea, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, defs, linearGradient, stop } from 'recharts'

type P = { data: Array<{ name: string; value: number }> }
export function AreaChart({ data }: P) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-sm mb-2 text-muted-foreground">Total Visitors</div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <RArea data={data} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="currentColor" stopOpacity={0.35} />
                <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeOpacity={0.1} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip cursor={{ strokeOpacity: 0.1 }} />
            <Area type="monotone" dataKey="value" stroke="currentColor" fill="url(#fill)" strokeWidth={2} />
          </RArea>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

### 6.4 DataTable (TanStack Table + shadcn)

Arquivos principais:

- `table/DataTable.tsx` (com table, toolbar, paginação)
- `table/columns.ts` (definição de colunas com `accessorKey`, `cell`, `header`)
- `table/column-visibility.tsx` (Popover/Sheet com checkboxes para “Customize Columns”)

Pontos obrigatórios:

- Filtro global por texto
- Ordenação clicando no header
- Paginação (client ou server)
- Seleção de linhas
- **Colunas visíveis** persistidas em Zustand (`use-ui.ts`) por `tableId`

**Exemplo – columns.ts (trecho):**

```tsx
import { ColumnDef } from '@tanstack/react-table'
export type Row = { id: string; section: string; type: string; status: 'Done'|'In Process'; target: number; limit: number; reviewer: string }

export const columns: ColumnDef<Row>[] = [
  { accessorKey: 'section', header: 'Header' },
  { accessorKey: 'type', header: 'Section Type' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'target', header: 'Target' },
  { accessorKey: 'limit', header: 'Limit' },
  { accessorKey: 'reviewer', header: 'Reviewer' },
]
```

**Exemplo – persistência de visibilidade (Zustand):**

```ts
// store/use-ui.ts
import { create } from 'zustand'

type Visibility = Record<string, boolean>

interface UIState {
  columnVisibility: Record<string, Visibility> // por tabela
  setColumnVisibility: (tableId: string, v: Visibility) => void
}

export const useUI = create<UIState>((set) => ({
  columnVisibility: {},
  setColumnVisibility: (id, v) => set((s) => ({ columnVisibility: { ...s.columnVisibility, [id]: v } })),
}))
```

**Toolbar com “Customize Columns”** usa `DropdownMenu` ou `Sheet` para toggles de colunas.

---

## 7) Dados e Fetching (React Query)

- Criar `lib/queryClient.ts` para instanciar e prover o `QueryClient`.
- Padrão de **adapters**: `lib/adapters/supabase.ts`, `lib/adapters/rest.ts`. Assim a tabela/gráfico consomem **hooks** como `useKpis()`, `useVisitors(period)`, `useDocuments()` sem acoplar à origem dos dados.
- **SSR** (opcional): hydrate/deshydrate para melhorar TTFB do dashboard inicial.

**Exemplo – hook simples:**

```ts
import { useQuery } from '@tanstack/react-query'
export function useVisitors(period: '90d'|'30d'|'7d') {
  return useQuery({
    queryKey: ['visitors', period],
    queryFn: () => fetch(`/api/visitors?period=${period}`).then((r) => r.json()),
    staleTime: 60_000,
  })
}
```

---

## 8) Autenticação e controle de acesso (opcional)

Escolha 1:

- **Supabase Auth**: simples e já integra com banco (útil para NTEX/Cartório Paulista)
- **Clerk**: DX excelente; pronto para TanStack Start

Gate de rota: se não autenticado ➝ tela de login.

---

## 9) Interações ricas e UX

- **Command Menu (⌘K)** com `command` do shadcn para abrir navegação e ações rápidas.
- **Toasts** para feedback de ações.
- **Skeletons**/spinners nos carregamentos.
- **Keyboard shortcuts** (`cmd+k`, `g` ➝ `d` para dashboard, etc.).
- **Responsive first**: grid fluido; tabela com `scroll-area` em mobile; cards empilham.

---

## 10) Performance e acessibilidade

- Lazy load para gráficos/tabelas pesadas.
- `prefers-reduced-motion` para animações.
- Sem texto abaixo de 12–13px.
- Contraste AA; foco visível; labels em inputs.

---

## 11) Checklist de geração (para o Cursor)

1. Criar projeto (TanStack Start ou Next) + Tailwind v4.
2. Iniciar shadcn e **adicionar** componentes listados.
3. Implementar **AppShell** e **Sidebar** colapsável.
4. Criar **CardKPI**, **AreaChart** e **DataTable** com “Customize Columns”.
5. Implementar **QueryClient**, hooks de dados e loaders (se houver SSR).
6. Adicionar **Command Menu**, **Theme Toggle**, **Toasts**.
7. Popular com **dados mock** e preparar adapters (Supabase/REST).
8. Garantir **responsividade**, **a11y** e dark mode.
9. Adicionar testes básicos de render/aria.

---

## 12) Roteiro de tarefas para projetos reais (NTEX / Cartório Paulista)

-

---

## 13) Snippets auxiliares

**ThemeToggle minimal**

```tsx
import { useEffect, useState } from 'react'
export function ThemeToggle(){
  const [dark, setDark] = useState(true)
  useEffect(()=>{ document.documentElement.classList.toggle('dark', dark)},[dark])
  return (
    <button onClick={()=>setDark(!dark)} className="px-2 py-1 text-xs border rounded-lg">
      {dark ? 'Dark' : 'Light'}
    </button>
  )
}
```

**cn util**

```ts
export function cn(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ')
}
```

---

## 14) Entregáveis mínimos

- Projeto com AppShell, KPIs, AreaChart, DataTable funcional
- Tema dark/light e acessibilidade ok
- Adapters de dados + mocks
- Scripts: `dev`, `build`, `preview`, `lint`
- Documentação curta no README com como trocar a fonte de dados

---

## 15) Observações finais

- O layout segue o **padrão visual shadcn** (o mesmo da referência). Os componentes aqui descritos são modularizados para o Cursor conseguir gerar/editar partes sem quebrar o TODO.
- Mantemos a tabela e o gráfico desacoplados via **hooks de dados**, o que facilita plugar Supabase, GA4, Reviews do Google, etc., sem reescrever o UI.

---

**Fim.**

