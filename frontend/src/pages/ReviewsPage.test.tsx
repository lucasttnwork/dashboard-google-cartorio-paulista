import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useAuthStore } from '@/lib/auth/store'
import ReviewsPage from './ReviewsPage'

// jsdom lacks PointerEvent — stub for shadcn dialogs / selects
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
      <MemoryRouter initialEntries={['/reviews']}>
        <ReviewsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ReviewsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: '1', email: 'admin@cartorio.com', role: 'admin', created_at: '2026-01-01' },
    })
  })

  it('renders review cards from API', async () => {
    renderPage()

    // Page title
    expect(screen.getByText('Avaliações')).toBeInTheDocument()

    // Wait for review data to load
    await waitFor(() => {
      expect(screen.getByText('Maria Souza')).toBeInTheDocument()
    })
    expect(screen.getByText('Joao Pereira')).toBeInTheDocument()
    // Anonymous reviewer renders as "Anônimo"
    expect(screen.getByText('Anônimo')).toBeInTheDocument()

    // Verify total count shows
    expect(screen.getByText(/3 avaliações encontradas/)).toBeInTheDocument()
  })

  it('renders search input and rating select', () => {
    renderPage()

    // Search input placeholder
    const searchInput = screen.getByPlaceholderText('Buscar por comentário ou avaliador...')
    expect(searchInput).toBeInTheDocument()

    // Rating select renders as combobox with hidden input value "all"
    const selectTrigger = screen.getByRole('combobox')
    expect(selectTrigger).toBeInTheDocument()
    const hiddenInput = document.querySelector('input[aria-hidden="true"]') as HTMLInputElement
    expect(hiddenInput).toBeTruthy()
    expect(hiddenInput.value).toBe('all')
  })

  it('shows PT-BR empty message when no results', async () => {
    server.use(
      http.get('*/api/v1/reviews', () => {
        return HttpResponse.json({
          items: [],
          next_cursor: null,
          has_more: false,
          total: 0,
        })
      }),
    )

    renderPage()

    await waitFor(() => {
      expect(
        screen.getByText('Nenhuma avaliação encontrada para os filtros selecionados.'),
      ).toBeInTheDocument()
    })
  })

  it('clicking a review opens detail dialog', async () => {
    renderPage()

    // Wait for reviews to load
    await waitFor(() => {
      expect(screen.getByText('Maria Souza')).toBeInTheDocument()
    })

    // Click the first review card containing "Maria Souza"
    // Card renders with data-slot="card"
    const reviewCard = screen.getByText('Maria Souza').closest('[data-slot="card"]')
    expect(reviewCard).toBeTruthy()
    fireEvent.click(reviewCard!)

    // Dialog should open with detail title
    await waitFor(() => {
      expect(screen.getByText('Detalhes da avaliação')).toBeInTheDocument()
    })
  })
})
