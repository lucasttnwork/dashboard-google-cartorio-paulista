// import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
// import { supabase } from '@/lib/supabase'
import type {
  Collaborator,
  CollaboratorCreate,
  CollaboratorUpdate,
  CollaboratorsQuery
} from '@/lib/dtos/collaborator'

// Mock data for development and fallback
const mockCollaborators: Collaborator[] = [
  {
    id: 1,
    full_name: 'Ana Sophia',
    department: 'E-notariado',
    position: 'Atendente',
    is_active: true,
    aliases: ['ana.sophia', 'ana'],
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z'
  },
  {
    id: 2,
    full_name: 'Karen Figueiredo',
    department: 'E-notariado',
    position: 'Especialista',
    is_active: true,
    aliases: ['karen.figueiredo'],
    created_at: '2024-01-14T09:30:00Z',
    updated_at: '2024-01-14T09:30:00Z'
  },
  {
    id: 3,
    full_name: 'Kaio Gomes',
    department: 'E-notariado',
    position: 'Coordenador',
    is_active: true,
    aliases: ['kaio.gomes', 'kaio'],
    created_at: '2024-01-13T14:20:00Z',
    updated_at: '2024-01-13T14:20:00Z'
  },
  {
    id: 4,
    full_name: 'Letícia Andreza',
    department: 'Administrativo',
    position: 'Assistente',
    is_active: true,
    aliases: ['leticia.andreza'],
    created_at: '2024-01-12T11:15:00Z',
    updated_at: '2024-01-12T11:15:00Z'
  },
  {
    id: 5,
    full_name: 'Fabiana Medeiros',
    department: 'E-notariado',
    position: 'Analista',
    is_active: true,
    aliases: ['fabiana.medeiros'],
    created_at: '2024-01-11T16:45:00Z',
    updated_at: '2024-01-11T16:45:00Z'
  },
  {
    id: 6,
    full_name: 'João Carlos',
    department: 'TI',
    position: 'Desenvolvedor',
    is_active: true,
    aliases: ['joao.carlos'],
    created_at: '2024-01-10T08:30:00Z',
    updated_at: '2024-01-10T08:30:00Z'
  },
  {
    id: 7,
    full_name: 'Maria Silva',
    department: 'Jurídico',
    position: 'Advogada',
    is_active: true,
    aliases: ['maria.silva'],
    created_at: '2024-01-09T13:20:00Z',
    updated_at: '2024-01-09T13:20:00Z'
  },
  {
    id: 8,
    full_name: 'Pedro Santos',
    department: 'Administrativo',
    position: 'Gerente',
    is_active: false,
    aliases: ['pedro.santos'],
    created_at: '2024-01-08T10:10:00Z',
    updated_at: '2024-01-08T10:10:00Z'
  },
  {
    id: 9,
    full_name: 'Carla Oliveira',
    department: 'E-notariado',
    position: 'Supervisora',
    is_active: true,
    aliases: ['carla.oliveira'],
    created_at: '2024-01-07T15:40:00Z',
    updated_at: '2024-01-07T15:40:00Z'
  }
]

const mockStats = {
  total_collaborators: 9,
  active_collaborators: 8,
  inactive_collaborators: 1,
  top_department: 'E-notariado'
}

// Simple hooks without React Query dependencies
export function useCollaborators(query: CollaboratorsQuery = { page: 1, pageSize: 10 }) {
  // Apply filters and pagination to mock data
  let filtered = [...mockCollaborators]

  // Apply search filter
  if (query.q) {
    const searchTerm = query.q.toLowerCase()
    filtered = filtered.filter(c =>
      c.full_name.toLowerCase().includes(searchTerm) ||
      c.department?.toLowerCase().includes(searchTerm) ||
      c.position?.toLowerCase().includes(searchTerm)
    )
  }

  // Apply department filter
  if (query.department) {
    filtered = filtered.filter(c => c.department === query.department)
  }

  // Apply active status filter
  if (query.is_active !== undefined) {
    filtered = filtered.filter(c => c.is_active === query.is_active)
  }

  // Apply sorting
  if (query.sort) {
    const [field, direction] = query.sort.split(':')
    filtered.sort((a, b) => {
      const aVal = a[field as keyof Collaborator]
      const bVal = b[field as keyof Collaborator]

      if (aVal && bVal) {
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        return direction === 'desc' ? -comparison : comparison
      }
      return 0
    })
  } else {
    // Default sort by name
    filtered.sort((a, b) => a.full_name.localeCompare(b.full_name))
  }

  // Apply pagination
  const page = query.page || 1
  const pageSize = query.pageSize || 10
  const startIndex = (page - 1) * pageSize
  const paginatedData = filtered.slice(startIndex, startIndex + pageSize)

  return {
    data: {
      data: paginatedData,
      meta: {
        total: filtered.length,
        page,
        pageSize,
        totalPages: Math.ceil(filtered.length / pageSize),
        hasNext: page < Math.ceil(filtered.length / pageSize),
        hasPrev: page > 1
      }
    },
    isLoading: false,
    error: null
  }
}

export function useCollaborator(id: number) {
  const collaborator = mockCollaborators.find(c => c.id === id)
  return {
    data: collaborator || null,
    isLoading: false,
    error: null
  }
}

export function useCollaboratorsStats() {
  return {
    data: mockStats,
    isLoading: false,
    error: null
  }
}

export function useCreateCollaborator() {
  return {
    mutateAsync: async (data: CollaboratorCreate) => {
      const newId = Math.max(...mockCollaborators.map(c => c.id)) + 1
      const newCollaborator: Collaborator = {
        ...data,
        id: newId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      mockCollaborators.push(newCollaborator)
      return { data: newCollaborator }
    },
    isPending: false
  }
}

export function useUpdateCollaborator() {
  return {
    mutateAsync: async ({ id, data }: { id: number; data: CollaboratorUpdate }) => {
      const index = mockCollaborators.findIndex(c => c.id === id)
      if (index === -1) {
        throw new Error('Collaborator not found')
      }
      mockCollaborators[index] = {
        ...mockCollaborators[index],
        ...data,
        updated_at: new Date().toISOString()
      }
      return { data: mockCollaborators[index] }
    },
    isPending: false
  }
}

export function useDeleteCollaborator() {
  return {
    mutateAsync: async (id: number) => {
      const index = mockCollaborators.findIndex(c => c.id === id)
      if (index === -1) {
        throw new Error('Collaborator not found')
      }
      mockCollaborators.splice(index, 1)
      return { data: { deleted: true } }
    },
    isPending: false
  }
}

// Legacy hooks for backward compatibility
export function useMockTopCollaborators() {
  return {
    data: [
      { full_name: 'Ana Sophia', department: 'E-notariado', mentions: 45 },
      { full_name: 'Karen Figueiredo', department: 'E-notariado', mentions: 33 },
      { full_name: 'Kaio Gomes', department: 'E-notariado', mentions: 29 },
      { full_name: 'Letícia Andreza', department: 'E-notariado', mentions: 28 },
      { full_name: 'Fabiana Medeiros', department: 'E-notariado', mentions: 27 },
    ],
    isLoading: false,
    error: null
  }
}