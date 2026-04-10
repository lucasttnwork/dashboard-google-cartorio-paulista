import { http, HttpResponse } from 'msw'
import { dashboardHandlers } from './dashboard-handlers'

const API = import.meta.env.VITE_API_BASE_URL ?? ''

export const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'admin@cartorio.com',
  role: 'admin',
  created_at: '2026-04-10T00:00:00Z',
}

export const mockCollaborators = [
  {
    id: 1,
    full_name: 'Ana Silva',
    aliases: ['Aninha'],
    department: 'E-notariado',
    position: 'Atendente',
    is_active: true,
    mention_count: 12,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 2,
    full_name: 'Bruno Costa',
    aliases: [],
    department: 'Registro',
    position: 'Escrevente',
    is_active: true,
    mention_count: 5,
    created_at: '2026-04-02T00:00:00Z',
    updated_at: '2026-04-02T00:00:00Z',
  },
  {
    id: 3,
    full_name: 'Carlos Inativo',
    aliases: ['Carlão'],
    department: null,
    position: null,
    is_active: false,
    mention_count: 0,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-15T00:00:00Z',
  },
]

export const handlers = [
  // ---- Auth ----
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

  // ---- Collaborators ----
  http.get(`${API}/api/v1/collaborators`, ({ request }) => {
    const url = new URL(request.url)
    const includeInactive = url.searchParams.get('include_inactive') === 'true'
    const items = includeInactive
      ? mockCollaborators
      : mockCollaborators.filter((c) => c.is_active)
    return HttpResponse.json({
      items,
      total: items.length,
      page: 1,
      page_size: 200,
    })
  }),

  http.post(`${API}/api/v1/collaborators`, async ({ request }) => {
    const body = (await request.json()) as { full_name: string; aliases?: string[]; department?: string | null; position?: string | null }
    return HttpResponse.json({
      id: 99,
      full_name: body.full_name,
      aliases: body.aliases ?? [],
      department: body.department ?? null,
      position: body.position ?? null,
      is_active: true,
      mention_count: 0,
      created_at: '2026-04-10T00:00:00Z',
      updated_at: '2026-04-10T00:00:00Z',
    }, { status: 201 })
  }),

  http.post(`${API}/api/v1/collaborators/merge`, async ({ request }) => {
    const body = (await request.json()) as { source_id: number; target_id: number }
    return HttpResponse.json({
      target_id: body.target_id,
      mentions_transferred: 12,
      aliases_added: ['Ana Silva', 'Aninha'],
      source_deactivated: true,
    })
  }),

  // ---- Dashboard / Reviews / Metrics (Phase 3) ----
  ...dashboardHandlers,
]
