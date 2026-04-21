import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useAuthStore } from '@/lib/auth/store'
import DashboardPage from './DashboardPage'

function makeCollaborators(count: number) {
  return Array.from({ length: count }).map((_, i) => ({
    collaborator_id: i + 1,
    full_name: `Colaborador ${i + 1}`,
    is_active: true,
    total_mentions: count - i, // descending so sort order is stable
    avg_rating_mentioned: 4.5,
    monthly: [],
  }))
}

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

    // Default is now "Mês atual" (≤31 days) → daily granularity, so the
    // first chart card title is "Avaliações por Dia".
    await waitFor(() => {
      expect(screen.getByText('Avaliações por Dia')).toBeInTheDocument()
    })
    expect(screen.getByText('Evolução da Nota Média')).toBeInTheDocument()
  })

  // Dashboard opens on "Mês atual" (1st of current month → today) with
  // daily-granularity chart. Sliding window, no configuration required.
  it('defaults to "Mês atual" with daily chart', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Mês atual')).toBeInTheDocument()
    })
    expect(
      await screen.findByText('Avaliações por Dia'),
    ).toBeInTheDocument()
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

  // FEAT-3.9-2: Expand "Colaboradores Mais Mencionados" in-place.
  describe('collaborators table expand/collapse', () => {
    it('collapses to 5 rows with "Ver todos (N)" button when N > 5', async () => {
      server.use(
        http.get('*/api/v1/metrics/collaborator-mentions', () => {
          return HttpResponse.json({
            collaborators: makeCollaborators(8),
          })
        }),
      )
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Colaborador 1')).toBeInTheDocument()
      })
      // Only 5 of 8 rows visible initially
      expect(screen.getByText('Colaborador 5')).toBeInTheDocument()
      expect(screen.queryByText('Colaborador 6')).not.toBeInTheDocument()
      // Expand button exposes the real count
      expect(
        screen.getByRole('button', { name: 'Ver todos (8)' }),
      ).toBeInTheDocument()
    })

    it('expands to show all rows when "Ver todos" is clicked', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('*/api/v1/metrics/collaborator-mentions', () => {
          return HttpResponse.json({
            collaborators: makeCollaborators(8),
          })
        }),
      )
      renderPage()

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Ver todos (8)' }),
        ).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Ver todos (8)' }))

      // All 8 rows visible
      expect(screen.getByText('Colaborador 6')).toBeInTheDocument()
      expect(screen.getByText('Colaborador 8')).toBeInTheDocument()
      // Button flips to "Ver menos"
      expect(
        screen.getByRole('button', { name: 'Ver menos' }),
      ).toBeInTheDocument()
    })

    it('hides the expand button when N ≤ 5', async () => {
      server.use(
        http.get('*/api/v1/metrics/collaborator-mentions', () => {
          return HttpResponse.json({
            collaborators: makeCollaborators(3),
          })
        }),
      )
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Colaborador 1')).toBeInTheDocument()
      })
      expect(
        screen.queryByRole('button', { name: /Ver todos/ }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Ver menos' }),
      ).not.toBeInTheDocument()
    })
  })
})
