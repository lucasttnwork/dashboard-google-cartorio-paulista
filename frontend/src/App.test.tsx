import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import HealthPage from './pages/HealthPage'

describe('HealthPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ status: 'ok', service: 'backend' }),
        }),
      ),
    )
  })

  it('renders the health heading', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <HealthPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(
      screen.getByRole('heading', { name: /Cartório Dashboard — Health/i }),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/"status":"ok"/)).toBeInTheDocument()
    })
  })
})
