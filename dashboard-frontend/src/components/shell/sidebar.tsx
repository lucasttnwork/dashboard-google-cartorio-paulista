"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useUI } from "@/store/use-ui"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  BarChart3,
  Calendar,
  FileText,
  Home,
  Menu,
  Settings,
  TrendingUp,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Reviews", href: "/reviews", icon: FileText },
  { name: "Collaborators", href: "/collaborators", icon: Users },
  { name: "Trends", href: "/trends", icon: TrendingUp },
  { name: "Reports", href: "/reports", icon: Calendar },
]

const bottomNavigation = [
  { name: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed } = useUI()
  const pathname = usePathname()

  return (
    <div className={cn(
      "relative flex h-full flex-col border-r bg-card transition-all duration-300",
      sidebarCollapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4">
        {!sidebarCollapsed && (
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">Cartório</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="h-8 w-8 transition-all duration-200 hover:scale-110 active:scale-95 hover:bg-accent"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4 transition-transform duration-200" />
          ) : (
            <ChevronLeft className="h-4 w-4 transition-transform duration-200" />
          )}
        </Button>
      </div>

      <Separator />

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link key={item.name} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
                    sidebarCollapsed ? "px-2" : "px-3",
                    isActive && "bg-secondary shadow-sm",
                    !isActive && "hover:bg-accent hover:shadow-sm"
                  )}
                >
                  <item.icon className={cn(
                    "h-4 w-4 transition-colors duration-200",
                    !sidebarCollapsed && "mr-3"
                  )} />
                  {!sidebarCollapsed && (
                    <span className="text-sm transition-colors duration-200">{item.name}</span>
                  )}
                </Button>
              </Link>
            )
          })}
        </div>
      </ScrollArea>

      <Separator />

      {/* Bottom Navigation */}
      <div className="p-2">
        {bottomNavigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link key={item.name} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
                  sidebarCollapsed ? "px-2" : "px-3",
                  isActive && "bg-secondary shadow-sm",
                  !isActive && "hover:bg-accent hover:shadow-sm"
                )}
              >
                <item.icon className={cn(
                  "h-4 w-4 transition-colors duration-200",
                  !sidebarCollapsed && "mr-3"
                )} />
                {!sidebarCollapsed && (
                  <span className="text-sm transition-colors duration-200">{item.name}</span>
                )}
              </Button>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
