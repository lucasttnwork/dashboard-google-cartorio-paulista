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

  it('renders period selection dropdown with "Últimos 2 meses" as default', () => {
    renderPage()

    // shadcn Select renders a combobox trigger with the selected value
    const selectTrigger = screen.getByRole('combobox')
    expect(selectTrigger).toBeInTheDocument()
    // FEAT-3.9-1: default is now "2" (Últimos 2 meses), no longer "12"
    const hiddenInput = document.querySelector('input[aria-hidden="true"]') as HTMLInputElement
    expect(hiddenInput).toBeTruthy()
    expect(hiddenInput.value).toBe('2')
  })

  // FEAT-3.9-1: switching away from the new 2-month default back to a
  // 3-month preset emits ?months=3 and drops the daily-granularity state.
  it('honours "Últimos 3 meses" selection after default (months=3)', async () => {
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

  // BUG-3.9-1 regression: selecting "Personalizado" must actually enter
  // custom mode and surface the DateRangePicker trigger. Prior code only
  // deleted `months`, so `isCustom` (derived from `from`/`to`) stayed false
  // and the combobox snapped back to "Últimos 12 meses".
  it('flips to custom mode and reflects preset=custom in the URL', async () => {
    const user = userEvent.setup()
    renderPage()

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

    // URL gains the explicit preset flag
    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toContain(
        'preset=custom',
      )
    })
  })

  // BUG-3.9-1 regression: when leaving custom mode back to a preset, the
  // URL must drop the `preset=custom` flag so `isCustom` flips back to false.
  it('clears preset=custom and sets months when switching away from custom', async () => {
    const user = userEvent.setup()
    renderPage('/analytics?preset=custom')

    // Start with DateRangePicker visible
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
      expect(search).not.toContain('preset=custom')
    })

    // DateRangePicker disappears
    expect(
      screen.queryByRole('button', { name: 'Selecionar período' }),
    ).not.toBeInTheDocument()
  })
})
