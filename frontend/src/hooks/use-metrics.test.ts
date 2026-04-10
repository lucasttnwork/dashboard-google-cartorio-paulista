import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useMetricsOverview } from './use-metrics'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useMetricsOverview', () => {
  it('fetches and returns metrics overview data', async () => {
    const { result } = renderHook(() => useMetricsOverview(), {
      wrapper: createWrapper(),
    })

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    // Wait for data to resolve
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // Verify data matches mock (from dashboard-handlers)
    expect(result.current.data).toBeDefined()
    expect(result.current.data!.total_reviews).toBe(347)
    expect(result.current.data!.avg_rating).toBe(4.72)
    expect(result.current.data!.five_star_pct).toBe(82.4)
    expect(result.current.data!.total_enotariado).toBe(95)
    expect(result.current.data!.period_start).toBe('2025-04-01')
    expect(result.current.data!.period_end).toBe('2026-04-01')
  })
})
