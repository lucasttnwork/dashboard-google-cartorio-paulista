import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AxiosError } from 'axios'
import { Dice5, Eye, EyeOff } from 'lucide-react'

import {
  changePasswordSchema,
  type ChangePasswordForm,
} from '@/lib/auth/schemas'
import { authApi } from '@/lib/api/auth'
import { useAuthStore } from '@/lib/auth/store'
import { generateStrongPassword } from '@/lib/password'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [submitting, setSubmitting] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const forced = user?.must_change_password === true

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  async function onSubmit(data: ChangePasswordForm) {
    setSubmitting(true)
    try {
      await authApi.changePassword(data.currentPassword, data.newPassword)
      toast.success('Senha atualizada com sucesso.')
      if (user) {
        setUser({ ...user, must_change_password: false })
      }
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (err instanceof AxiosError) {
        const detail = (err.response?.data as { detail?: string })?.detail
        if (detail === 'invalid_current_password') {
          toast.error('Senha atual incorreta')
        } else if (detail === 'weak_password') {
          toast.error('Senha muito fraca')
        } else {
          toast.error('Erro ao alterar senha')
        }
      } else {
        toast.error('Erro ao alterar senha')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Alterar senha</CardTitle>
          <CardDescription>
            Defina uma nova senha de acesso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forced && (
            <Alert className="mb-4">
              <AlertDescription>
                Por seguranca, voce precisa definir uma nova senha antes de
                continuar usando o painel.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Senha atual</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...register('currentPassword')}
              />
              {errors.currentPassword && (
                <p className="text-sm text-destructive">
                  {errors.currentPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova senha</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="newPassword"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    {...register('newPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
                    tabIndex={-1}
                    aria-label={showNew ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showNew ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const pwd = generateStrongPassword()
                    setValue('newPassword', pwd, { shouldValidate: true })
                    setValue('confirmPassword', pwd, { shouldValidate: true })
                    setShowNew(true)
                  }}
                  title="Gerar senha forte"
                  aria-label="Gerar senha forte"
                >
                  <Dice5 className="h-4 w-4" />
                </Button>
              </div>
              {errors.newPassword && (
                <p className="text-sm text-destructive">
                  {errors.newPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar nova senha'}
            </Button>

            {!forced && (
              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="text-muted-foreground underline-offset-4 hover:underline"
                >
                  Voltar
                </button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
