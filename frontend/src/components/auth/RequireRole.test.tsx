import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RequireRole } from './RequireRole'
import { useAuthStore } from '@/lib/auth/store'

function renderWithRoutes(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<div>home-page</div>} />
        <Route
          path="/admin"
          element={
            <RequireRole allowed={['admin']}>
              <div>admin-content</div>
            </RequireRole>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireRole', () => {
  it('redirects to / when user role is not allowed', () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: '1', email: 'viewer@cartorio.com', role: 'viewer', created_at: '2026-01-01' },
    })
    renderWithRoutes('/admin')
    expect(screen.getByText('home-page')).toBeInTheDocument()
    expect(screen.queryByText('admin-content')).not.toBeInTheDocument()
  })

  it('redirects to / when user is null', () => {
    useAuthStore.setState({ status: 'unauthenticated', user: null })
    renderWithRoutes('/admin')
    expect(screen.getByText('home-page')).toBeInTheDocument()
    expect(screen.queryByText('admin-content')).not.toBeInTheDocument()
  })

  it('renders children when user role is allowed', () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: '1', email: 'admin@cartorio.com', role: 'admin', created_at: '2026-01-01' },
    })
    renderWithRoutes('/admin')
    expect(screen.getByText('admin-content')).toBeInTheDocument()
    expect(screen.queryByText('home-page')).not.toBeInTheDocument()
  })
})
