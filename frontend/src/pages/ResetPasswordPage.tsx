import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AxiosError } from 'axios'

import { resetSchema, type ResetForm } from '@/lib/auth/schemas'
import { authApi } from '@/lib/api/auth'
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

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  // Supabase recovery emails deliver tokens in the URL hash fragment:
  // #access_token=...&refresh_token=...&type=recovery
  const accessToken = useMemo(() => {
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    return params.get('access_token') ?? ''
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  })

  async function onSubmit(data: ResetForm) {
    if (!accessToken) {
      toast.error('Token de recuperacao ausente. Solicite um novo link.')
      return
    }

    setSubmitting(true)
    try {
      await authApi.reset(accessToken, data.password)
      toast.success('Senha atualizada com sucesso.')
      navigate('/login', { replace: true })
    } catch (err) {
      if (err instanceof AxiosError) {
        const detail = (err.response?.data as { detail?: string })?.detail
        if (detail === 'weak_password') {
          toast.error('Senha muito fraca. Escolha uma senha mais forte.')
        } else {
          toast.error('Token expirado ou invalido. Solicite um novo link.')
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Nova senha</CardTitle>
          <CardDescription>Defina sua nova senha de acesso.</CardDescription>
        </CardHeader>
        <CardContent>
          {!accessToken && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                Token de recuperacao nao encontrado. Use o link enviado por e-mail.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
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

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !accessToken}
            >
              {submitting ? 'Salvando...' : 'Salvar nova senha'}
            </Button>

            <div className="text-center text-sm">
              <Link
                to="/login"
                className="text-muted-foreground underline-offset-4 hover:underline"
              >
                Voltar ao login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
