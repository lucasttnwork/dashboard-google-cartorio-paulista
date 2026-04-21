import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
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

function LocationEcho() {
  const loc = useLocation()
  return <div data-testid="location-search">{loc.search}</div>
}

function renderPage(initialEntry: string = '/analytics') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AnalyticsPage />
        <LocationEcho />
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
    // D4: E-notariado section visible because mock data has reviews_enotariado > 0
    await waitFor(() => {
      expect(screen.getByText('Avaliações E-notariado vs. Outras')).toBeInTheDocument()
    })
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

  it('renders period selection dropdown with "Mês atual" as default', () => {
    renderPage()

    const selectTrigger = screen.getByRole('combobox')
    expect(selectTrigger).toBeInTheDocument()
    // Default now is `current-month` (1st of the calendar month → today).
    const hiddenInput = document.querySelector('input[aria-hidden="true"]') as HTMLInputElement
    expect(hiddenInput).toBeTruthy()
    expect(hiddenInput.value).toBe('current-month')
  })

  it('honours "Últimos 3 meses" selection (months=3 in URL)', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Análises')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('combobox'))
    const threeMonthsOption = await screen.findByRole('option', {
      name: 'Últimos 3 meses',
    })
    await user.click(threeMonthsOption)

    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toContain(
        'months=3',
      )
    })
  })

  // Picking "Personalizado" surfaces the DateRangePicker trigger but must
  // NOT mutate the URL — the deferred-apply flow means a fetch only fires
  // once the user clicks Aplicar inside the picker.
  it('opens the DateRangePicker without touching the URL when "Personalizado" is chosen', async () => {
    const user = userEvent.setup()
    renderPage('/analytics?months=3')

    await waitFor(() => {
      expect(screen.getByText('Análises')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('combobox'))
    const customOption = await screen.findByRole('option', {
      name: 'Personalizado',
    })
    await user.click(customOption)

    // DateRangePicker trigger becomes visible
    expect(
      await screen.findByRole('button', { name: 'Selecionar período' }),
    ).toBeInTheDocument()

    // URL unchanged — the previously-applied months=3 stays until Aplicar.
    const search = screen.getByTestId('location-search').textContent ?? ''
    expect(search).toContain('months=3')
    expect(search).not.toContain('preset=custom')
    expect(search).not.toContain('from=')
  })

  // Leaving an applied custom window back to a preset clears from/to and
  // writes months=6 so downstream hooks snap back onto the preset window.
  it('clears from/to and sets months when switching away from an applied custom range', async () => {
    const user = userEvent.setup()
    renderPage('/analytics?from=2026-01-01&to=2026-01-31')

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Selecionar período' }),
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('combobox'))
    const sixMonthsOption = await screen.findByRole('option', {
      name: 'Últimos 6 meses',
    })
    await user.click(sixMonthsOption)

    await waitFor(() => {
      const search = screen.getByTestId('location-search').textContent ?? ''
      expect(search).toContain('months=6')
      expect(search).not.toContain('from=')
      expect(search).not.toContain('to=')
    })

    expect(
      screen.queryByRole('button', { name: 'Selecionar período' }),
    ).not.toBeInTheDocument()
  })
})
