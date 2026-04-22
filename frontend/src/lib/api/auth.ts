import apiClient from './client'
import type { User } from '@/lib/auth/store'

interface LoginPayload {
  email: string
  password: string
}

interface LoginResponse {
  user: User
  expires_at: number | null
}

interface MeResponse {
  id: string
  email: string
  role: string
  created_at: string
  app_metadata: Record<string, unknown>
  must_change_password?: boolean
}

export const authApi = {
  login: (data: LoginPayload) =>
    apiClient.post<LoginResponse>('/api/v1/auth/login', data).then((r) => r.data),

  logout: () => apiClient.post('/api/v1/auth/logout'),

  me: () =>
    apiClient.get<MeResponse>('/api/v1/auth/me').then((r): User => ({
      id: r.data.id,
      email: r.data.email,
      role: r.data.role,
      created_at: r.data.created_at,
      must_change_password: r.data.must_change_password ?? false,
    })),

  forgot: (email: string) =>
    apiClient.post('/api/v1/auth/forgot', { email }),

  reset: (accessToken: string, password: string) =>
    apiClient.post('/api/v1/auth/reset', { access_token: accessToken, password }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post('/api/v1/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
}
