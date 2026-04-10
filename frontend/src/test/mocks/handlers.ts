import { http, HttpResponse } from 'msw'

const API = import.meta.env.VITE_API_BASE_URL ?? ''

export const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'admin@cartorio.com',
  role: 'admin',
  created_at: '2026-04-10T00:00:00Z',
}

export const handlers = [
  http.get(`${API}/api/v1/auth/me`, () => {
    return HttpResponse.json({
      ...mockUser,
      app_metadata: {},
    })
  }),

  http.post(`${API}/api/v1/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    if (body.password === 'wrong') {
      return HttpResponse.json({ detail: 'invalid_credentials' }, { status: 401 })
    }
    if (body.password === 'ratelimited') {
      return HttpResponse.json(
        { detail: 'too_many_attempts' },
        { status: 429, headers: { 'Retry-After': '900' } },
      )
    }
    return HttpResponse.json({
      user: mockUser,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })
  }),

  http.post(`${API}/api/v1/auth/logout`, () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/api/v1/auth/forgot`, () => {
    return HttpResponse.json({})
  }),

  http.post(`${API}/api/v1/auth/reset`, async ({ request }) => {
    const body = (await request.json()) as { access_token: string; password: string }
    if (body.password.length < 8) {
      return HttpResponse.json({ detail: 'weak_password' }, { status: 400 })
    }
    return HttpResponse.json({ ok: true })
  }),
]
