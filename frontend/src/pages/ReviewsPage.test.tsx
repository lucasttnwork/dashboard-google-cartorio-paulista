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

function renderPage(initialUrl: string = '/reviews') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
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

    // Verify progress indicator shows (U4: "Exibindo X de N")
    expect(screen.getByText(/Exibindo .+ de .+ avaliações/)).toBeInTheDocument()
  })

  it('renders search input and rating select', () => {
    renderPage()

    // Search input placeholder
    const searchInput = screen.getByPlaceholderText('Buscar por comentário ou avaliador...')
    expect(searchInput).toBeInTheDocument()

    // Multiple selects now: rating, reply filter, sort (U2, U3)
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThanOrEqual(3)
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

  it('initializes rating and sentiment filters from URL search params (AC-3.7.15)', async () => {
    renderPage('/reviews?rating=5&sentiment=pos')

    // Wait for reviews to finish loading so selects are fully rendered
    await waitFor(() => {
      expect(screen.getByText('Maria Souza')).toBeInTheDocument()
    })

    // Each Select trigger renders its current label in a <span> child.
    // Scope the lookup to the combobox triggers to avoid matching other
    // occurrences (e.g. sentiment badges inside review cards).
    const triggers = screen.getAllByRole('combobox')
    const triggerLabels = triggers.map((t) => t.textContent ?? '')
    expect(triggerLabels.some((t) => t.includes('5 estrelas'))).toBe(true)
    expect(triggerLabels.some((t) => t.includes('Positivo'))).toBe(true)
  })

  it('persists compact view mode via localStorage on mount (AC-3.7.17)', async () => {
    // Pre-seed the preference BEFORE rendering — the page reads it
    // synchronously during initial state init.
    window.localStorage.setItem('reviews-view-mode', 'compact')
    try {
      renderPage()

      // Wait until data is loaded so the active layout is materialized
      await waitFor(() => {
        expect(screen.getByText('Maria Souza')).toBeInTheDocument()
      })

      // The compact toggle button must be pressed (aria-pressed="true").
      // The expanded toggle must NOT be pressed.
      const compactBtn = screen.getByRole('button', { name: /Compacto/i })
      const expandedBtn = screen.getByRole('button', { name: /Expandido/i })
      expect(compactBtn.getAttribute('aria-pressed')).toBe('true')
      expect(expandedBtn.getAttribute('aria-pressed')).toBe('false')

      // Compact mode renders rows via divs, NOT via <Card data-slot="card">.
      // The expanded <Card> elements must not appear for the review items
      // (the empty-state card is gated on allReviews.length === 0 so it
      // is absent too when reviews are present).
      const cards = document.querySelectorAll('[data-slot="card"]')
      expect(cards.length).toBe(0)
    } finally {
      window.localStorage.removeItem('reviews-view-mode')
    }
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
