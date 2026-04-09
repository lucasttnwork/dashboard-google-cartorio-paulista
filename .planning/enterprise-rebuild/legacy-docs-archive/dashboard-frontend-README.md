# Dashboard Cartório Paulista

Dashboard moderno para monitoramento de avaliações do Google Business Profile do Cartório Paulista, desenvolvido seguindo o blueprint Shadcn + TanStack.

## 🚀 Funcionalidades

- **Dashboard Completo**: Visão geral com KPIs, gráficos e tabelas
- **Tema Dark/Light**: Interface moderna com suporte a temas
- **Sidebar Colapsável**: Navegação organizada e responsiva
- **Gráficos Interativos**: Evolução temporal das avaliações
- **Tabela Avançada**: Filtros, ordenação e seleção de colunas
- **Menu de Comando**: Navegação rápida com ⌘K
- **Filtros de Período**: Análise por período personalizado
- **Integração Supabase**: Dados em tempo real do banco

## 🛠️ Stack Tecnológica

- **Framework**: Next.js 15 + React 19
- **UI**: Shadcn/ui + Tailwind CSS v4
- **Dados**: TanStack Query + Supabase
- **Tabelas**: TanStack Table
- **Estado**: Zustand
- **Ícones**: Lucide React
- **Gráficos**: Recharts

## 📦 Instalação

1. **Clone o repositório**
   ```bash
   git clone <repository-url>
   cd dashboard-frontend
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**
   ```bash
   cp .env.local.example .env.local
   ```

   Edite o arquivo `.env.local` com suas credenciais do Supabase:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

4. **Execute o projeto**
   ```bash
   npm run dev
   ```

5. **Acesse**: http://localhost:3000

## 📊 Estrutura dos Dados

O dashboard consome dados do Supabase com as seguintes tabelas principais:

- **reviews**: Avaliações com rating, comentário, data
- **collaborators**: Colaboradores mencionados nas avaliações
- **gbp_locations**: Informações da localização
- **review_collaborators**: Relação entre reviews e colaboradores

## 🎨 Componentes Principais

- **AppShell**: Layout principal com sidebar e topbar
- **CardKPI**: Cards de métricas principais
- **AreaChart**: Gráfico de evolução temporal
- **DataTable**: Tabela avançada com filtros
- **CommandMenu**: Menu de busca e navegação
- **PeriodFilter**: Filtros de período

## 🏗️ Arquitetura

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Providers e layout raiz
│   └── page.tsx          # Página principal do dashboard
├── components/
│   ├── shell/            # AppShell e Sidebar
│   ├── kpi/              # Cards de métricas
│   ├── charts/           # Gráficos (Recharts)
│   ├── table/            # Tabelas (TanStack Table)
│   ├── command/          # Menu de comando
│   └── ui/               # Componentes Shadcn/ui
├── lib/
│   ├── adapters/         # Adaptadores de dados (Supabase)
│   ├── hooks/            # React Query hooks
│   ├── queryClient.ts    # Configuração TanStack Query
│   ├── theme.ts          # Provider de tema
│   └── utils.ts          # Utilitários
└── store/
    └── use-ui.ts         # Estado global (Zustand)
```

## 🔧 Scripts Disponíveis

- `npm run dev` - Servidor de desenvolvimento
- `npm run build` - Build de produção
- `npm run start` - Servidor de produção
- `npm run lint` - Verificação de linting

## 🎯 Funcionalidades Implementadas

✅ **Layout Responsivo**: Sidebar colapsável + Topbar
✅ **Tema Dark/Light**: Alternância automática
✅ **KPIs em Tempo Real**: Cards com métricas principais
✅ **Gráficos Interativos**: Área chart com gradientes
✅ **Tabela Avançada**: Filtros, ordenação, paginação
✅ **Seleção de Colunas**: Personalização da tabela
✅ **Menu de Comando**: Navegação rápida (⌘K)
✅ **Filtros de Período**: 7d, 30d, 90d, personalizado
✅ **Integração Supabase**: Dados reais do banco
✅ **Estado Persistente**: Configurações salvas

## 📈 Próximas Implementações

- [ ] Dashboard de colaboradores individuais
- [ ] Análise de sentimento das avaliações
- [ ] Relatórios exportáveis (PDF/Excel)
- [ ] Notificações em tempo real
- [ ] Filtros avançados por colaborador
- [ ] Métricas de performance por período

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

---

**Desenvolvido com ❤️ para o Cartório Paulista**

# Tokens de Tema (HSL)

- Os tokens ficam em `src/app/globals.css` no bloco `:root` (dark por padrão).
- Use sempre classes Tailwind com `hsl(var(--token))` (ex.: `bg-[hsl(var(--card))]`).
- Novos tons devem seguir HSL e serem centralizados no `:root` (sem hex soltos).
- Controles ghost usam borda `--border` e `hover:bg-white/5`; foco com `--ring`.
- Gráficos usam `--chart-1` para stroke e degradê “silver wave” no `<defs>`.