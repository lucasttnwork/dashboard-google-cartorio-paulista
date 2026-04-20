import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useAuthStore } from '@/lib/auth/store'
import CollectionHealthPage from './CollectionHealthPage'

const API = import.meta.env.VITE_API_BASE_URL ?? ''

const mockHealthData = {
  runs: [
    {
      id: 1,
      run_type: 'scheduled',
      status: 'completed',
      started_at: new Date(Date.now() - 30 * 60000).toISOString(),
      completed_at: new Date(Date.now() - 29 * 60000).toISOString(),
      reviews_found: 10,
      reviews_new: 3,
      reviews_updated: 7,
      error_message: null,
      execution_time_ms: 45000,
    },
    {
      id: 2,
      run_type: 'scheduled',
      status: 'failed',
      started_at: new Date(Date.now() - 120 * 60000).toISOString(),
      completed_at: null,
      reviews_found: 0,
      reviews_new: 0,
      reviews_updated: 0,
      error_message: 'Timeout after 300s',
      execution_time_ms: null,
    },
  ],
  consecutive_failures: 0,
  last_success_at: new Date(Date.now() - 30 * 60000).toISOString(),
  is_degraded: false,
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/collection-health']}>
        <CollectionHealthPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CollectionHealthPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: '1', email: 'admin@cartorio.com', role: 'admin', created_at: '2026-01-01' },
    })
    server.use(
      http.get(`${API}/api/v1/admin/collection-health`, () => {
        return HttpResponse.json(mockHealthData)
      }),
    )
  })

  it('renders page title and status card', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Saúde da Coleta')).toBeInTheDocument()
    })
    expect(screen.getByText('Coleta funcionando')).toBeInTheDocument()
  })

  it('renders run history table with data', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Concluído')).toBeInTheDocument()
    })
    expect(screen.getByText('Falhou')).toBeInTheDocument()
    expect(screen.getByText('Timeout after 300s')).toBeInTheDocument()
  })

  it('shows warning badge when last success > 3h ago', async () => {
    server.use(
      http.get(`${API}/api/v1/admin/collection-health`, () => {
        return HttpResponse.json({
          ...mockHealthData,
          last_success_at: new Date(Date.now() - 4 * 3600000).toISOString(),
        })
      }),
    )
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Atenção')).toBeInTheDocument()
    })
  })

  it('shows error badge when last success > 6h ago', async () => {
    server.use(
      http.get(`${API}/api/v1/admin/collection-health`, () => {
        return HttpResponse.json({
          ...mockHealthData,
          last_success_at: new Date(Date.now() - 8 * 3600000).toISOString(),
          is_degraded: true,
          consecutive_failures: 5,
        })
      }),
    )
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Falha')).toBeInTheDocument()
    })
    expect(screen.getByText('Resetar Modo Degradado')).toBeInTheDocument()
  })

  it('calls reset endpoint when button clicked', async () => {
    let resetCalled = false
    server.use(
      http.get(`${API}/api/v1/admin/collection-health`, () => {
        return HttpResponse.json({
          ...mockHealthData,
          is_degraded: true,
          consecutive_failures: 5,
          last_success_at: new Date(Date.now() - 8 * 3600000).toISOString(),
        })
      }),
      http.post(`${API}/api/v1/admin/collection-health/reset`, () => {
        resetCalled = true
        return HttpResponse.json({ ok: true })
      }),
    )
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Resetar Modo Degradado')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Resetar Modo Degradado'))
    await waitFor(() => {
      expect(resetCalled).toBe(true)
    })
  })

  it('hides reset button when not degraded', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Coleta funcionando')).toBeInTheDocument()
    })
    expect(screen.queryByText('Resetar Modo Degradado')).not.toBeInTheDocument()
  })
})
