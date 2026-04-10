import { useEffect, type ReactNode } from 'react'
import { useAuthStore } from '@/lib/auth/store'
import { authApi } from '@/lib/api/auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser)
  const setStatus = useAuthStore((s) => s.setStatus)

  useEffect(() => {
    setStatus('loading')
    authApi
      .me()
      .then((user) => {
        setUser(user)
        setStatus('authenticated')
      })
      .catch(() => {
        setUser(null)
        setStatus('unauthenticated')
      })
  }, [setUser, setStatus])

  return <>{children}</>
}
