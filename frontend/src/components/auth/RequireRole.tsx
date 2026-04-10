import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/lib/auth/store'

interface Props {
  allowed: string[]
  children: ReactNode
}

export function RequireRole({ allowed, children }: Props) {
  const user = useAuthStore((s) => s.user)

  if (!user || !allowed.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
