"use client"

import { PropsWithChildren } from 'react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { CommandMenu } from '@/components/command/command-menu'
import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/shell/sidebar'
import { Bell } from 'lucide-react'

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex h-screen">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--elevated))]/80 px-6 backdrop-blur">
            <div className="flex flex-1 items-center gap-4">
              {/* Command Menu */}
              <div className="max-w-md flex-1">
                <CommandMenu />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Notifications */}
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Bell className="h-4 w-4" />
                <span className="sr-only">Notificações</span>
              </Button>

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Avatar */}
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center">
                  CP
                </div>
                <span className="sr-only">Perfil</span>
              </Button>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
