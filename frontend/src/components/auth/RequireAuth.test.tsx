import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './RequireAuth'
import { useAuthStore } from '@/lib/auth/store'

function renderWithRoutes(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>login-page</div>} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <div>protected-content</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  it('shows loading spinner when status is loading', () => {
    useAuthStore.setState({ status: 'loading', user: null })
    renderWithRoutes('/')
    expect(screen.queryByText('protected-content')).not.toBeInTheDocument()
    expect(screen.queryByText('login-page')).not.toBeInTheDocument()
  })

  it('redirects to /login when unauthenticated', () => {
    useAuthStore.setState({ status: 'unauthenticated', user: null })
    renderWithRoutes('/')
    expect(screen.getByText('login-page')).toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: '1', email: 'a@b.com', role: 'admin', created_at: '2026-01-01' },
    })
    renderWithRoutes('/')
    expect(screen.getByText('protected-content')).toBeInTheDocument()
  })
})
