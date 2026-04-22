import { useState } from 'react'
import { Copy, Check, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'

interface Props {
  open: boolean
  onClose: () => void
  email: string
  tempPassword: string
}

export function TempPasswordModal({ open, onClose, email, tempPassword }: Props) {
  const [copied, setCopied] = useState(false)

  const copyCredentials = async () => {
    const text = `E-mail: ${email}\nSenha temporária: ${tempPassword}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Credenciais copiadas')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Usuário criado com sucesso</DialogTitle>
        </DialogHeader>
        <Alert className="flex items-start gap-2 border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-sm">
            Esta é a única vez que a senha será exibida. Copie agora e
            transmita ao usuário por um canal seguro.
          </span>
        </Alert>
        <div className="space-y-3">
          <div>
            <Label>E-mail</Label>
            <Input value={email} readOnly />
          </div>
          <div>
            <Label>Senha temporária</Label>
            <Input value={tempPassword} readOnly className="font-mono" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={copyCredentials}>
            {copied ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            Copiar credenciais
          </Button>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
