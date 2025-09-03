import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  useCollaborators,
  useCollaborator,
  useCreateCollaborator,
  useUpdateCollaborator,
  useDeleteCollaborator,
  useCollaboratorsStats
} from './use-collaborators'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn()
    }
  }
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
  TestWrapper.displayName = 'TestWrapper'
  return TestWrapper
}

describe('useCollaborators', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch collaborators successfully', async () => {
    const mockData = {
      data: {
        data: [
          {
            id: 1,
            full_name: 'Test User',
            department: 'IT',
            position: 'Developer',
            is_active: true,
            aliases: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
          }
        ],
        meta: {
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          hasNext: false,
          hasPrev: false
        }
      }
    }

    const mockSupabase = await import('@/lib/supabase')
    mockSupabase.supabase.functions.invoke.mockResolvedValue(mockData)

    const { result } = renderHook(() => useCollaborators(), {
      wrapper: createWrapper()
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockData.data)
  })

  it('should handle fetch error', async () => {
    const mockError = { message: 'Network error' }

    const mockSupabase = await import('@/lib/supabase')
    mockSupabase.supabase.functions.invoke.mockRejectedValue(mockError)

    const { result } = renderHook(() => useCollaborators(), {
      wrapper: createWrapper()
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toEqual(mockError)
  })
})

describe('useCreateCollaborator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create collaborator successfully', async () => {
    const mockData = {
      data: {
        id: 1,
        full_name: 'New User',
        department: 'IT',
        position: 'Developer',
        is_active: true,
        aliases: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      },
      meta: {
        timestamp: '2024-01-01T00:00:00Z',
        requestId: 'test-request-id'
      }
    }

    const mockSupabase = await import('@/lib/supabase')
    mockSupabase.supabase.functions.invoke.mockResolvedValue(mockData)

    const { result } = renderHook(() => useCreateCollaborator(), {
      wrapper: createWrapper()
    })

    const newCollaborator = {
      full_name: 'New User',
      department: 'IT',
      position: 'Developer',
      is_active: true,
      aliases: []
    }

    result.current.mutate(newCollaborator)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockData.data)
  })

  it('should handle create error', async () => {
    const mockError = { message: 'Validation error' }

    const mockSupabase = await import('@/lib/supabase')
    mockSupabase.supabase.functions.invoke.mockRejectedValue(mockError)

    const { result } = renderHook(() => useCreateCollaborator(), {
      wrapper: createWrapper()
    })

    const newCollaborator = {
      full_name: 'New User',
      department: 'IT',
      position: 'Developer',
      is_active: true,
      aliases: []
    }

    result.current.mutate(newCollaborator)

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toEqual(mockError)
  })
})

describe('useUpdateCollaborator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should update collaborator successfully', async () => {
    const mockData = {
      data: {
        id: 1,
        full_name: 'Updated User',
        department: 'IT',
        position: 'Senior Developer',
        is_active: true,
        aliases: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T01:00:00Z'
      },
      meta: {
        timestamp: '2024-01-01T01:00:00Z',
        requestId: 'test-request-id'
      }
    }

    const mockSupabase = await import('@/lib/supabase')
    mockSupabase.supabase.functions.invoke.mockResolvedValue(mockData)

    const { result } = renderHook(() => useUpdateCollaborator(), {
      wrapper: createWrapper()
    })

    const updateData = {
      full_name: 'Updated User',
      position: 'Senior Developer'
    }

    result.current.mutate({ id: 1, data: updateData })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockData.data)
  })
})

describe('useDeleteCollaborator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delete collaborator successfully', async () => {
    const mockData = {
      data: { deleted: true },
      meta: {
        timestamp: '2024-01-01T00:00:00Z',
        requestId: 'test-request-id'
      }
    }

    const mockSupabase = await import('@/lib/supabase')
    mockSupabase.supabase.functions.invoke.mockResolvedValue(mockData)

    const { result } = renderHook(() => useDeleteCollaborator(), {
      wrapper: createWrapper()
    })

    result.current.mutate(1)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockData.data)
  })
})

describe('useCollaboratorsStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch collaborators stats successfully', async () => {
    const mockData = {
      data: {
        total_collaborators: 10,
        active_collaborators: 8,
        inactive_collaborators: 2,
        top_department: 'IT'
      },
      meta: {
        timestamp: '2024-01-01T00:00:00Z',
        requestId: 'test-request-id'
      }
    }

    const mockSupabase = await import('@/lib/supabase')
    mockSupabase.supabase.functions.invoke.mockResolvedValue(mockData)

    const { result } = renderHook(() => useCollaboratorsStats(), {
      wrapper: createWrapper()
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockData.data)
  })
})
