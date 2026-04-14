import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { describe, it, expect } from 'vitest'
import { useTrends, useCollaboratorMentions } from './use-metrics'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
  return { queryClient, wrapper }
}

describe('useTrends query key', () => {
  it('isolates cache entries by granularity', async () => {
    const { queryClient, wrapper } = createWrapper()

    const monthly = renderHook(
      () =>
        useTrends({
          date_from: '2026-01-01',
          date_to: '2026-03-31',
          granularity: 'month',
        }),
      { wrapper },
    )
    const daily = renderHook(
      () =>
        useTrends({
          date_from: '2026-01-01',
          date_to: '2026-03-31',
          granularity: 'day',
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(monthly.result.current.isSuccess).toBe(true)
      expect(daily.result.current.isSuccess).toBe(true)
    })

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey)
      .filter((k) => Array.isArray(k) && k[0] === 'metrics-trends')

    expect(keys).toHaveLength(2)
    const granularities = keys.map((k) => k[k.length - 1]).sort()
    expect(granularities).toEqual(['day', 'month'])
  })
})

describe('useCollaboratorMentions query key', () => {
  it('isolates cache entries by date window', async () => {
    const { queryClient, wrapper } = createWrapper()

    renderHook(
      () =>
        useCollaboratorMentions({
          date_from: '2026-01-01',
          date_to: '2026-01-31',
        }),
      { wrapper },
    )
    renderHook(
      () =>
        useCollaboratorMentions({
          date_from: '2026-02-01',
          date_to: '2026-02-28',
        }),
      { wrapper },
    )

    await waitFor(() => {
      const fetched = queryClient
        .getQueryCache()
        .getAll()
        .filter((q) => q.queryKey[0] === 'metrics-collaborator-mentions')
      expect(fetched.length).toBe(2)
    })
  })
})
