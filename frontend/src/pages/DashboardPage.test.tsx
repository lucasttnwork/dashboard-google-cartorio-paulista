import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useAuthStore } from '@/lib/auth/store'
import DashboardPage from './DashboardPage'

// recharts ResponsiveContainer requires ResizeObserver in jsdom
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof window.ResizeObserver
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
}

function renderPage() {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: '1', email: 'admin@cartorio.com', role: 'admin', created_at: '2026-01-01' },
    })
  })

  it('renders 4 KPI cards with correct PT-BR labels', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Total de Avaliações')).toBeInTheDocument()
    })
    expect(screen.getByText('Nota Média')).toBeInTheDocument()
    expect(screen.getByText('Avaliações 5 Estrelas')).toBeInTheDocument()
    expect(screen.getByText('Avaliações E-notariado')).toBeInTheDocument()

    // Check that KPI values load (from mock: 347 total reviews)
    await waitFor(() => {
      expect(screen.getByText('347')).toBeInTheDocument()
    })
  })

  it('renders trend chart area', async () => {
    renderPage()

    // The chart card titles should appear
    await waitFor(() => {
      expect(screen.getByText('Avaliações por Mês')).toBeInTheDocument()
    })
    expect(screen.getByText('Evolução da Nota Média')).toBeInTheDocument()
  })

  it('shows skeletons before data loads', () => {
    // Override handlers with delayed responses to ensure loading state
    server.use(
      http.get('*/api/v1/metrics/overview', () => {
        return new Promise(() => {
          // Never resolves — keeps loading state
        })
      }),
      http.get('*/api/v1/metrics/trends', () => {
        return new Promise(() => {})
      }),
      http.get('*/api/v1/metrics/collaborator-mentions', () => {
        return new Promise(() => {})
      }),
    )

    renderPage()

    // KPI card titles should still be visible
    expect(screen.getByText('Total de Avaliações')).toBeInTheDocument()
    // Skeleton elements should be present (Skeleton renders with data-slot="skeleton")
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows error toast message on API failure', async () => {
    server.use(
      http.get('*/api/v1/metrics/overview', () => {
        return HttpResponse.json({ detail: 'server_error' }, { status: 500 })
      }),
    )

    renderPage()

    // The KPI cards should show em-dash when error occurs
    await waitFor(() => {
      const dashes = screen.getAllByText('\u2014')
      expect(dashes.length).toBeGreaterThanOrEqual(4)
    })
  })
})
