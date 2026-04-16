import { useState, useCallback } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  UserCircle,
  Users,
  FileUp,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/lib/auth/store'
import { apiClient } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { DataFreshnessIndicator } from '@/components/layout/DataFreshnessIndicator'

const navItems = [
  { to: '/dashboard', label: 'Painel Geral', icon: LayoutDashboard },
  { to: '/reviews', label: 'Avaliações', icon: MessageSquare },
  { to: '/analytics', label: 'Análises', icon: BarChart3 },
  { to: '/performance', label: 'Meu Desempenho', icon: UserCircle },
] as const

const adminItems = [
  { to: '/admin/collaborators', label: 'Colaboradores', icon: Users },
  { to: '/admin/dataset-upload', label: 'Importar Dados', icon: FileUp, roles: ['admin'] as string[] },
] as const

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gestor',
  viewer: 'Visualizador',
}

function NavItem({
  to,
  label,
  icon: Icon,
  onClick,
}: {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick?: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-primary/10 font-semibold text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        ].join(' ')
      }
    >
      <Icon className="size-5 shrink-0" />
      {label}
    </NavLink>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const handleLogout = useCallback(async () => {
    try {
      await apiClient.post('/api/v1/auth/logout')
    } catch {
      // proceed with local cleanup regardless
    }
    useAuthStore.getState().reset()
    navigate('/login')
  }, [navigate])

  const isAdminOrManager =
    user?.role === 'admin' || user?.role === 'manager'

  return (
    <div className="flex h-full flex-col">
      {/* Header — not a semantic heading (A1): the sidebar brand is
          decorative, the real <h1> lives in the current route header. */}
      <div className="px-4 py-6">
        <p className="text-lg font-bold tracking-tight text-foreground">
          Cartório Paulista
        </p>
        <p className="text-xs text-muted-foreground">
          Painel de Avaliações
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} onClick={onNavigate} />
        ))}

        {isAdminOrManager && (
          <>
            <Separator className="my-3" />
            <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Administração
            </p>
            {adminItems
              .filter((item) => !('roles' in item) || (item.roles as string[]).includes(user?.role ?? ''))
              .map((item) => (
                <NavItem key={item.to} {...item} onClick={onNavigate} />
              ))}
          </>
        )}
      </nav>

      {/* Data freshness — rendered above the user block so the sidebar
          always surfaces how recent the underlying data is, even when the
          user scrolls past the navigation. */}
      <div className="border-t border-border px-4 py-3">
        <DataFreshnessIndicator className="w-full justify-start" />
      </div>

      {/* User section */}
      <div className="border-t border-border p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="truncate text-sm text-foreground">
            {user?.email}
          </span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {roleLabels[user?.role ?? ''] ?? user?.role}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="size-4" />
          Sair
        </Button>
      </div>
    </div>
  )
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* A2: Skip link for keyboard users — visible only on focus. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Pular para conteúdo principal
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeSidebar}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeSidebar()
          }}
          role="button"
          tabIndex={-1}
          aria-label="Fechar menu"
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card transition-transform duration-200 ease-in-out lg:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-end p-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={closeSidebar}
            aria-label="Fechar menu"
          >
            <X className="size-5" />
          </Button>
        </div>
        <SidebarContent onNavigate={closeSidebar} />
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center border-b border-border bg-card px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </Button>
          <span className="ml-3 font-semibold text-foreground">
            Cartório Paulista
          </span>
        </header>

        <main id="main-content" className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
