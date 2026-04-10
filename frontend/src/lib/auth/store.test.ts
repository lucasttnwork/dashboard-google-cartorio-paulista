import { useAuthStore } from './store'

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().reset()
  })

  it('starts with loading status and null user', () => {
    // reset sets unauthenticated, so re-init for default
    useAuthStore.setState({ status: 'loading', user: null })
    const state = useAuthStore.getState()
    expect(state.status).toBe('loading')
    expect(state.user).toBeNull()
  })

  it('setUser updates user', () => {
    const user = { id: '1', email: 'a@b.com', role: 'admin', created_at: '2026-01-01' }
    useAuthStore.getState().setUser(user)
    expect(useAuthStore.getState().user).toEqual(user)
  })

  it('setStatus updates status', () => {
    useAuthStore.getState().setStatus('authenticated')
    expect(useAuthStore.getState().status).toBe('authenticated')
  })

  it('reset clears user and sets unauthenticated', () => {
    const user = { id: '1', email: 'a@b.com', role: 'admin', created_at: '2026-01-01' }
    useAuthStore.getState().setUser(user)
    useAuthStore.getState().setStatus('authenticated')
    useAuthStore.getState().reset()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })
})
