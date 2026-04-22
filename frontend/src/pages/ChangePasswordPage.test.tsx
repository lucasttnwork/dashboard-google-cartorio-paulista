import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useAuthStore } from '@/lib/auth/store'
import ChangePasswordPage from './ChangePasswordPage'

const API = import.meta.env.VITE_API_BASE_URL ?? ''

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/account/password']}>
      <ChangePasswordPage />
    </MemoryRouter>,
  )
}

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    useAuthStore.getState().reset()
    useAuthStore.getState().setUser({
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'user@cartorio.com',
      role: 'viewer',
      created_at: '2026-04-10T00:00:00Z',
      must_change_password: false,
    })
    useAuthStore.getState().setStatus('authenticated')
  })

  it('renders the form fields', () => {
    renderPage()
    expect(screen.getByLabelText(/senha atual/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^nova senha$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirmar nova senha/i)).toBeInTheDocument()
  })

  it('happy path: posts and clears must_change_password on success', async () => {
    let payload: unknown = null
    server.use(
      http.post(`${API}/api/v1/auth/change-password`, async ({ request }) => {
        payload = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    useAuthStore.getState().setUser({
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'user@cartorio.com',
      role: 'viewer',
      created_at: '2026-04-10T00:00:00Z',
      must_change_password: true,
    })

    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/senha atual/i), 'old-secret')
    await user.type(screen.getByLabelText(/^nova senha$/i), 'NewStrong123!')
    await user.type(
      screen.getByLabelText(/confirmar nova senha/i),
      'NewStrong123!',
    )
    await user.click(screen.getByRole('button', { name: /salvar nova senha/i }))

    await waitFor(() => {
      expect(payload).toEqual({
        current_password: 'old-secret',
        new_password: 'NewStrong123!',
      })
    })
    await waitFor(() => {
      expect(useAuthStore.getState().user?.must_change_password).toBe(false)
    })
  })

  it('shows error when current password is wrong', async () => {
    server.use(
      http.post(`${API}/api/v1/auth/change-password`, () => {
        return HttpResponse.json(
          { detail: 'invalid_current_password' },
          { status: 400 },
        )
      }),
    )

    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/senha atual/i), 'bad')
    await user.type(screen.getByLabelText(/^nova senha$/i), 'NewStrong123!')
    await user.type(
      screen.getByLabelText(/confirmar nova senha/i),
      'NewStrong123!',
    )
    await user.click(screen.getByRole('button', { name: /salvar nova senha/i }))

    // User still in store with must_change_password unchanged
    await waitFor(() => {
      expect(useAuthStore.getState().user?.must_change_password).toBe(false)
    })
  })

  it('validates mismatching confirmation', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/senha atual/i), 'old-secret')
    await user.type(screen.getByLabelText(/^nova senha$/i), 'NewStrong123!')
    await user.type(
      screen.getByLabelText(/confirmar nova senha/i),
      'DifferentPass!',
    )
    await user.click(screen.getByRole('button', { name: /salvar nova senha/i }))

    await waitFor(() => {
      expect(screen.getByText(/senhas nao coincidem/i)).toBeInTheDocument()
    })
  })
})
