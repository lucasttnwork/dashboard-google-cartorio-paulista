import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { useAuthStore } from '@/lib/auth/store'
import AnalyticsPage from './AnalyticsPage'

// recharts ResponsiveContainer requires ResizeObserver in jsdom
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof window.ResizeObserver
}

// jsdom lacks PointerEvent — stub for shadcn Select / Switch
if (typeof window.PointerEvent === 'undefined') {
  class PointerEvent extends MouseEvent {
    readonly pointerId: number
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
    }
  }
  window.PointerEvent = PointerEvent as never
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
      <MemoryRouter initialEntries={['/analytics']}>
        <AnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: '1', email: 'admin@cartorio.com', role: 'admin', created_at: '2026-01-01' },
    })
  })

  it('renders page title and charts area', async () => {
    renderPage()

    // Page header
    expect(screen.getByText('Análises')).toBeInTheDocument()
    expect(screen.getByText('Tendências e desempenho detalhado')).toBeInTheDocument()

    // Chart section titles
    await waitFor(() => {
      expect(screen.getByText('Tendência da Nota Média')).toBeInTheDocument()
    })
    expect(screen.getByText('Avaliações E-notariado vs. Outras')).toBeInTheDocument()
  })

  it('renders collaborator performance table', async () => {
    renderPage()

    // Table section title
    await waitFor(() => {
      expect(screen.getByText('Desempenho dos Colaboradores')).toBeInTheDocument()
    })

    // Table headers
    await waitFor(() => {
      expect(screen.getByText('Nome')).toBeInTheDocument()
    })
    expect(screen.getByText('Menções')).toBeInTheDocument()
    expect(screen.getByText('Nota Média')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()

    // Collaborator data from mock
    await waitFor(() => {
      expect(screen.getByText('Ana Silva')).toBeInTheDocument()
    })
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument()
    expect(screen.getByText('Carla Oliveira')).toBeInTheDocument()
  })

  it('renders period selection dropdown', () => {
    renderPage()

    // shadcn Select renders a combobox trigger with the selected value
    const selectTrigger = screen.getByRole('combobox')
    expect(selectTrigger).toBeInTheDocument()
    // The hidden input holds the current value "12"
    const hiddenInput = document.querySelector('input[aria-hidden="true"]') as HTMLInputElement
    expect(hiddenInput).toBeTruthy()
    expect(hiddenInput.value).toBe('12')
  })
})
