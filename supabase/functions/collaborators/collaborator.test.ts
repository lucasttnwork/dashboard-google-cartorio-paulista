import { assertEquals, assertThrows } from "https://deno.land/std@0.192.0/testing/asserts.ts"
import { CollaboratorService, CollaboratorRepository } from "./collaborator.ts"

// Mock Supabase client
const mockSupabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: null, error: { code: 'PGRST116' } })
      }),
      range: () => Promise.resolve({ data: [], error: null, count: 0 }),
      order: () => ({
        range: () => Promise.resolve({ data: [], error: null, count: 0 })
      })
    }),
    insert: () => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 1, full_name: 'Test User' }, error: null })
      })
    }),
    update: () => ({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: 1, full_name: 'Updated User' }, error: null })
        })
      })
    }),
    delete: () => ({
      eq: () => Promise.resolve({ error: null })
    }),
    rpc: () => Promise.resolve({ data: [{ total_collaborators: 5, active_collaborators: 4 }], error: null })
  })
}

Deno.test("CollaboratorRepository - findAll returns paginated results", async () => {
  const repo = new CollaboratorRepository(mockSupabase as any)

  const result = await repo.findAll({ page: 1, pageSize: 10 })

  assertEquals(result.page, 1)
  assertEquals(result.pageSize, 10)
  assertEquals(result.data, [])
  assertEquals(result.total, 0)
})

Deno.test("CollaboratorRepository - findById returns null for non-existent collaborator", async () => {
  const repo = new CollaboratorRepository(mockSupabase as any)

  const result = await repo.findById(999)

  assertEquals(result, null)
})

Deno.test("CollaboratorRepository - create returns new collaborator", async () => {
  const repo = new CollaboratorRepository(mockSupabase as any)

  const newCollaborator = {
    full_name: 'Test User',
    department: 'IT',
    position: 'Developer',
    is_active: true,
    aliases: []
  }

  const result = await repo.create(newCollaborator)

  assertEquals(result.id, 1)
  assertEquals(result.full_name, 'Test User')
})

Deno.test("CollaboratorRepository - update returns updated collaborator", async () => {
  const repo = new CollaboratorRepository(mockSupabase as any)

  const updateData = {
    full_name: 'Updated User',
    department: 'HR'
  }

  const result = await repo.update(1, updateData)

  assertEquals(result.id, 1)
  assertEquals(result.full_name, 'Updated User')
})

Deno.test("CollaboratorService - createCollaborator validates duplicate names", async () => {
  const mockRepo = {
    findAll: () => Promise.resolve({ data: [{ id: 1, full_name: 'Existing User' }], total: 1 }),
    create: () => Promise.resolve({ id: 2, full_name: 'New User' })
  }

  const service = new CollaboratorService(mockRepo as any, mockSupabase as any)

  await assertThrows(
    async () => {
      await service.createCollaborator({
        full_name: 'Existing User',
        department: 'IT',
        position: 'Developer',
        is_active: true,
        aliases: []
      })
    },
    Error,
    'Collaborator with this name already exists'
  )
})

Deno.test("CollaboratorService - updateCollaborator validates duplicate names", async () => {
  const mockRepo = {
    findById: () => Promise.resolve({ id: 1, full_name: 'Current User' }),
    findAll: () => Promise.resolve({ data: [{ id: 2, full_name: 'Existing User' }], total: 1 }),
    update: () => Promise.resolve({ id: 1, full_name: 'Updated User' })
  }

  const service = new CollaboratorService(mockRepo as any, mockSupabase as any)

  await assertThrows(
    async () => {
      await service.updateCollaborator(1, {
        full_name: 'Existing User',
        department: 'HR'
      })
    },
    Error,
    'Collaborator with this name already exists'
  )
})

Deno.test("CollaboratorService - deleteCollaborator validates existence", async () => {
  const mockRepo = {
    findById: () => Promise.resolve(null),
    delete: () => Promise.resolve()
  }

  const service = new CollaboratorService(mockRepo as any, mockSupabase as any)

  await assertThrows(
    async () => {
      await service.deleteCollaborator(999)
    },
    Error,
    'Collaborator not found'
  )
})

Deno.test("CollaboratorService - deleteCollaborator prevents deletion with mentions", async () => {
  const mockSupabaseWithMentions = {
    ...mockSupabase,
    from: () => ({
      ...mockSupabase.from(),
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { id: 1, full_name: 'Test User' }, error: null })
        }),
        range: () => Promise.resolve({ data: [], error: null, count: 0 }),
        order: () => ({
          range: () => Promise.resolve({ data: [], error: null, count: 0 })
        }),
        head: () => true
      }),
      '*': () => ({
        count: 'exact',
        head: true
      })
    })
  }

  const mockRepo = {
    findById: () => Promise.resolve({ id: 1, full_name: 'Test User' }),
    delete: () => Promise.resolve()
  }

  const service = new CollaboratorService(mockRepo as any, mockSupabaseWithMentions as any)

  await assertThrows(
    async () => {
      await service.deleteCollaborator(1)
    },
    Error,
    'Cannot delete collaborator with existing mentions'
  )
})

console.log('✅ All collaborator tests passed!')
