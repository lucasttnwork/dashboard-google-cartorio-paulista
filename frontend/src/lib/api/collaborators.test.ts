import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { fetchCollaborators, createCollaborator, mergeCollaborators } from './collaborators'

describe('collaborators API client', () => {
  it('fetchCollaborators returns paginated data', async () => {
    const result = await fetchCollaborators({ page_size: 200 })
    expect(result.items).toHaveLength(2) // default: only active
    expect(result.items[0]!.full_name).toBe('Ana Silva')
    expect(result.items[1]!.full_name).toBe('Bruno Costa')
    expect(result.total).toBe(2)
    expect(result.page).toBe(1)
  })

  it('fetchCollaborators with include_inactive returns all', async () => {
    const result = await fetchCollaborators({ include_inactive: true, page_size: 200 })
    expect(result.items).toHaveLength(3)
    expect(result.items.some((c) => c.full_name === 'Carlos Inativo')).toBe(true)
  })

  it('createCollaborator sends POST and returns created entity', async () => {
    const created = await createCollaborator({
      full_name: 'Maria Santos',
      aliases: ['Mari'],
      department: 'Registro',
      position: null,
    })
    expect(created.id).toBe(99)
    expect(created.full_name).toBe('Maria Santos')
    expect(created.aliases).toEqual(['Mari'])
    expect(created.is_active).toBe(true)
    expect(created.mention_count).toBe(0)
  })

  it('mergeCollaborators sends POST and returns merge result', async () => {
    const result = await mergeCollaborators({ source_id: 1, target_id: 2 })
    expect(result.target_id).toBe(2)
    expect(result.mentions_transferred).toBe(12)
    expect(result.source_deactivated).toBe(true)
    expect(result.aliases_added).toContain('Ana Silva')
  })

  it('fetchCollaborators rejects on server error', async () => {
    server.use(
      http.get('*/api/v1/collaborators', () => {
        return HttpResponse.json({ detail: 'internal_error' }, { status: 500 })
      }),
    )

    await expect(fetchCollaborators({ page_size: 200 })).rejects.toThrow()
  })
})
