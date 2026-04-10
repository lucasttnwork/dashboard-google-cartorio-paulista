import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useAuthStore } from '@/lib/auth/store'
import apiClient from './client'

describe('apiClient interceptor', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: '1', email: 'a@b.com', role: 'admin', created_at: '2026-01-01' },
      status: 'authenticated',
    })
  })

  it('resets store on 401 from non-me endpoint', async () => {
    server.use(
      http.get('*/api/v1/some-endpoint', () => {
        return HttpResponse.json({ detail: 'unauthorized' }, { status: 401 })
      }),
    )

    await expect(apiClient.get('/api/v1/some-endpoint')).rejects.toThrow()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('does NOT reset store on 401 from /auth/me', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () => {
        return HttpResponse.json({ detail: 'not_authenticated' }, { status: 401 })
      }),
    )

    await expect(apiClient.get('/api/v1/auth/me')).rejects.toThrow()
    // Store should NOT be reset (AuthProvider handles /me failures itself)
    expect(useAuthStore.getState().status).toBe('authenticated')
  })
})
