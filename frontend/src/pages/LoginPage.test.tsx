import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useAuthStore } from '@/lib/auth/store'
import LoginPage from './LoginPage'

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.getState().reset()
  })

  it('renders the login form', () => {
    renderLogin()
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('shows validation errors for empty fields', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.click(screen.getByRole('button', { name: /entrar/i }))
    await waitFor(() => {
      expect(screen.getByText(/e-mail invalido/i)).toBeInTheDocument()
    })
  })

  it('sets user in store on successful login', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/e-mail/i), 'admin@cartorio.com')
    await user.type(screen.getByLabelText(/senha/i), 'validpassword')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('authenticated')
    })
    expect(useAuthStore.getState().user?.email).toBe('admin@cartorio.com')
  })

  it('shows error toast on 401', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () => {
        return HttpResponse.json({ detail: 'invalid_credentials' }, { status: 401 })
      }),
    )

    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/e-mail/i), 'admin@cartorio.com')
    await user.type(screen.getByLabelText(/senha/i), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    // After failed login, user should still be unauthenticated
    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('unauthenticated')
    })
  })
})
