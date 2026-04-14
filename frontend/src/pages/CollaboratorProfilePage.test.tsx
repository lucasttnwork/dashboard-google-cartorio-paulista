import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useAuthStore } from '@/lib/auth/store'
import { mockCollaboratorProfile } from '@/test/mocks/dashboard-handlers'
import CollaboratorProfilePage from './CollaboratorProfilePage'

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

function renderAt(path: string) {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/collaborators/:id"
            element={<CollaboratorProfilePage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CollaboratorProfilePage', () => {
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

  it('renders breadcrumb, KPI cards, histogram, chart and reviews table on success', async () => {
    renderAt('/collaborators/1')

    // Breadcrumb link
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'Colaboradores' }),
      ).toBeInTheDocument()
    })

    // Title with Title Case applied to the mocked full_name
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ana Silva' }),
    ).toBeInTheDocument()

    // 4 KPI cards — titles are unique labels in the page
    expect(screen.getByText('Total de menções')).toBeInTheDocument()
    expect(screen.getByText('Nota média')).toBeInTheDocument()
    expect(screen.getByText('Ranking')).toBeInTheDocument()
    expect(screen.getByText('Crescimento')).toBeInTheDocument()

    // Total mentions value renders using formatNumber
    expect(screen.getByText('42')).toBeInTheDocument()
    // Ranking "#2"
    expect(screen.getByText('#2')).toBeInTheDocument()

    // Histogram (5 rows labeled Distribuição de notas)
    const histogram = await screen.findByLabelText('Distribuição de notas')
    expect(histogram).toBeInTheDocument()
    expect(histogram.querySelectorAll('li').length).toBe(5)

    // Reviews table — one <tr> per recent review in the mock (+1 header row)
    await waitFor(() => {
      const rows = document.querySelectorAll('tbody tr')
      expect(rows.length).toBe(mockCollaboratorProfile.recent_reviews.length)
    })

    // Mention snippet surfaces in italic cell text
    expect(screen.getByText(/Ana foi maravilhosa/)).toBeInTheDocument()
  })

  it('renders "Colaborador não encontrado" when the API returns 404', async () => {
    server.use(
      http.get('*/api/v1/collaborators/:id/profile', () => {
        return HttpResponse.json({ detail: 'not_found' }, { status: 404 })
      }),
    )

    renderAt('/collaborators/999')

    await waitFor(() => {
      expect(
        screen.getByText('Colaborador não encontrado'),
      ).toBeInTheDocument()
    })

    // Back link to analytics
    const back = screen.getByRole('link', { name: /Voltar para Analytics/i })
    expect(back).toBeInTheDocument()
    expect(back.getAttribute('href')).toBe('/analytics')
  })
})
