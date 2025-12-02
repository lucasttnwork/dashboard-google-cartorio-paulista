"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  BarChart3,
  Calendar,
  FileText,
  Home,
  Search,
  Settings,
  Users,
} from "lucide-react"

const commands = [
  {
    name: "Dashboard",
    href: "/",
    icon: Home,
    description: "Visão geral do dashboard",
  },
  {
    name: "Avaliações",
    href: "/reviews",
    icon: FileText,
    description: "Gerenciar avaliações",
  },
  {
    name: "Colaboradores",
    href: "/collaborators",
    icon: Users,
    description: "Ver colaboradores",
  },
  {
    name: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    description: "Análises detalhadas",
  },
  {
    name: "Relatórios",
    href: "/reports",
    icon: Calendar,
    description: "Relatórios de performance",
  },
  {
    name: "Configurações",
    href: "/settings",
    icon: Settings,
    description: "Configurações do sistema",
  },
]

export function CommandMenu() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const handleSelect = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 py-2 w-full justify-start text-muted-foreground shadow-sm"
      >
        <Search className="mr-2 h-4 w-4" />
        Buscar...
        <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0">
          <DialogTitle className="sr-only">Buscar no dashboard</DialogTitle>
          <DialogDescription className="sr-only">
            Use as setas para navegar e Enter para abrir páginas do dashboard.
          </DialogDescription>
          <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
            <CommandInput
              autoFocus
              placeholder="Digite um comando ou busca..."
            />
            <CommandList>
              <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
              <CommandGroup heading="Navegação">
                {commands.map((command) => (
                  <CommandItem
                    key={command.name}
                    onSelect={() => handleSelect(command.href)}
                  >
                    <command.icon className="mr-2 h-4 w-4" />
                    <div className="flex flex-col">
                      <span>{command.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {command.description}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
