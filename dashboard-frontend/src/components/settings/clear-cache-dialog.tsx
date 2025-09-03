"use client"

import * as React from "react"
import { Trash2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface ClearCacheDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ClearCacheDialog({ open, onOpenChange }: ClearCacheDialogProps) {
  const [isLoading, setIsLoading] = React.useState(false)

  const handleClearCache = async () => {
    setIsLoading(true)

    try {
      // Simular limpeza de cache
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Limpar localStorage (dados do dashboard)
      const keysToRemove = [
        'dashboard-theme',
        'sidebar-collapsed',
        'user-preferences'
      ]

      keysToRemove.forEach(key => {
        localStorage.removeItem(key)
      })

      toast.success("Cache limpo com sucesso!", {
        description: "Todos os dados temporários foram removidos.",
        duration: 3000,
      })

      onOpenChange(false)

    } catch (error) {
      console.error("Erro ao limpar cache:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-500" />
            Limpar Cache
          </DialogTitle>
          <DialogDescription>
            Esta ação irá limpar todos os dados temporários do dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Atenção:</strong> Esta ação irá:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Limpar preferências de tema e layout</li>
                <li>Remover dados temporários armazenados</li>
                <li>Restaurar configurações padrão</li>
                <li>Não afetar dados de avaliações ou configurações importantes</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleClearCache}
            disabled={isLoading}
          >
            {isLoading ? "Limpando..." : "Limpar Cache"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
