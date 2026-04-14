import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import AppLayout from './AppLayout'
import { useAuthStore } from '@/lib/auth/store'

function DashboardPlaceholder() {
  return <h1>Painel Geral</h1>
}

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPlaceholder />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppLayout a11y (phase 3.8)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      user: {
        id: '1',
        email: 'admin@cartorio.com',
        role: 'admin',
        created_at: '2026-01-01',
      },
    })
  })

  it('A2: exposes a skip link to #main-content', () => {
    renderLayout()

    const skipLink = screen.getByRole('link', {
      name: /Pular para conteúdo principal/,
    })
    expect(skipLink).toBeInTheDocument()
    expect(skipLink.getAttribute('href')).toBe('#main-content')

    const main = screen.getByRole('main')
    expect(main.getAttribute('id')).toBe('main-content')
  })

  it('A1: renders a single <h1> per page (sidebar brand is not a heading)', () => {
    renderLayout()

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('Painel Geral')

    // Sidebar brand still visible as plain text, not a heading.
    expect(screen.getAllByText('Cartório Paulista').length).toBeGreaterThan(0)
  })
})
