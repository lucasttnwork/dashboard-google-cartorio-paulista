import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/lib/auth/store'
import { Skeleton } from '@/components/ui/skeleton'

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Skeleton className="h-12 w-12 rounded-full" />
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'loading') return <FullPageSpinner />
  if (status !== 'authenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}
