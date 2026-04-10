import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { AuthProvider } from './AuthProvider'
import { useAuthStore } from '@/lib/auth/store'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('AuthProvider', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, status: 'loading' })
  })

  it('hydrates user on successful /me', async () => {
    renderWithRouter(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('authenticated')
    })
    expect(useAuthStore.getState().user).not.toBeNull()
    expect(useAuthStore.getState().user?.email).toBe('admin@cartorio.com')
  })

  it('sets unauthenticated when /me returns 401', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () => {
        return HttpResponse.json({ detail: 'not_authenticated' }, { status: 401 })
      }),
    )

    renderWithRouter(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('unauthenticated')
    })
    expect(useAuthStore.getState().user).toBeNull()
  })
})
