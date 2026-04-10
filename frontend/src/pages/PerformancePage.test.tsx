import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useAuthStore } from '@/lib/auth/store'
import PerformancePage from './PerformancePage'

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderPage() {
  const qc = createQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/performance']}>
        <PerformancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PerformancePage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: '1', email: 'viewer@cartorio.com', role: 'viewer', created_at: '2026-01-01' },
    })
  })

  it('shows "not linked" message when user has no collaborator', async () => {
    server.use(
      http.get('*/api/v1/metrics/my-performance', () => {
        return HttpResponse.json({ linked: false })
      }),
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Perfil não vinculado')).toBeInTheDocument()
    })
    expect(
      screen.getByText(/Seu perfil ainda não foi vinculado/),
    ).toBeInTheDocument()
  })

  it('shows personal KPIs when linked', async () => {
    server.use(
      http.get('*/api/v1/metrics/my-performance', () => {
        return HttpResponse.json({
          linked: true,
          collaborator_id: 5,
          full_name: 'KAREN SILVA FIGUEIREDO',
          total_mentions: 275,
          avg_rating: 4.85,
          ranking: 3,
          total_collaborators: 13,
          monthly: [],
          recent_reviews: [],
        })
      }),
      http.get('*/api/v1/metrics/collaborator-mentions', () => {
        return HttpResponse.json({ collaborators: [] })
      }),
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Meu Desempenho')).toBeInTheDocument()
    })
    // Check Title Case applied
    expect(screen.getByText(/Karen Silva Figueiredo/)).toBeInTheDocument()
    // Check ranking displayed
    expect(screen.getByText('#3 de 13')).toBeInTheDocument()
  })

  it('renders page header after loading', async () => {
    server.use(
      http.get('*/api/v1/metrics/my-performance', () => {
        return HttpResponse.json({ linked: false })
      }),
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Meu Desempenho')).toBeInTheDocument()
    })
  })
})
