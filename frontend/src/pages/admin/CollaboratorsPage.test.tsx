import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useAuthStore } from '@/lib/auth/store'
import CollaboratorsPage from './CollaboratorsPage'

// jsdom lacks PointerEvent — stub it so shadcn Switch works in tests
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/collaborators']}>
      <CollaboratorsPage />
    </MemoryRouter>,
  )
}

describe('CollaboratorsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: '1', email: 'admin@cartorio.com', role: 'admin', created_at: '2026-01-01' },
    })
  })

  it('renders the page title and table', async () => {
    renderPage()
    expect(screen.getByText('Colaboradores')).toBeInTheDocument()
    // Table headers are present
    await waitFor(() => {
      expect(screen.getByText('Departamento')).toBeInTheDocument()
    })
    expect(screen.getByText('Cargo')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('shows collaborators from API', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Ana Silva')).toBeInTheDocument()
    })
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument()
    // Aliases should be visible
    expect(screen.getByText('Aninha')).toBeInTheDocument()
    // Departments
    expect(screen.getByText('E-notariado')).toBeInTheDocument()
    expect(screen.getByText('Registro')).toBeInTheDocument()
  })

  it('toggles inactive filter and shows inactive collaborators', async () => {
    renderPage()

    // Initially only active collaborators are shown (default: include_inactive = false)
    await waitFor(() => {
      expect(screen.getByText('Ana Silva')).toBeInTheDocument()
    })
    expect(screen.queryByText('Carlos Inativo')).not.toBeInTheDocument()

    // Toggle the "Incluir inativos" switch using fireEvent to bypass PointerEvent quirks
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    // After toggle, inactive collaborators should appear
    await waitFor(() => {
      expect(screen.getByText('Carlos Inativo')).toBeInTheDocument()
    })
  })

  it('shows empty state when no collaborators match', async () => {
    server.use(
      http.get('*/api/v1/collaborators', () => {
        return HttpResponse.json({
          items: [],
          total: 0,
          page: 1,
          page_size: 200,
        })
      }),
    )

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Nenhum colaborador encontrado')).toBeInTheDocument()
    })
  })
})
