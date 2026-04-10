import { test, expect } from '@playwright/test'

test.describe('Collaborators CRUD', () => {
  test('unauthenticated user cannot access /admin/collaborators', async ({ page }) => {
    await page.goto('/admin/collaborators')
    // RequireAuth redirects to /login
    await expect(page).toHaveURL(/\/login/)
  })

  test('/admin/collaborators page shows title and table structure', async ({ page }) => {
    // Mock the auth state by intercepting the /me endpoint
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-0000-0000-000000000001',
          email: 'admin@test.com',
          role: 'admin',
          created_at: '2026-01-01T00:00:00Z',
          app_metadata: {},
        }),
      })
    )

    // Mock the collaborators list endpoint
    await page.route('**/api/v1/collaborators?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 1,
              full_name: 'Ana Sophia',
              aliases: ['Ana'],
              department: 'E-notariado',
              position: 'Tabeliã',
              is_active: true,
              mention_count: 150,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
            {
              id: 2,
              full_name: 'Karen Figueiredo',
              aliases: [],
              department: 'E-notariado',
              position: null,
              is_active: true,
              mention_count: 80,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
          total: 2,
          page: 1,
          page_size: 50,
        }),
      })
    )

    await page.goto('/admin/collaborators')
    await expect(page.getByRole('heading', { name: /colaboradores/i })).toBeVisible()
    await expect(page.getByText('Ana Sophia')).toBeVisible()
    await expect(page.getByText('Karen Figueiredo')).toBeVisible()
  })

  test('new collaborator button opens form dialog', async ({ page }) => {
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-0000-0000-000000000001',
          email: 'admin@test.com',
          role: 'admin',
          created_at: '2026-01-01T00:00:00Z',
          app_metadata: {},
        }),
      })
    )

    await page.route('**/api/v1/collaborators?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 50 }),
      })
    )

    await page.goto('/admin/collaborators')
    await page.getByRole('button', { name: /novo/i }).click()
    await expect(page.getByText(/novo colaborador/i)).toBeVisible()
    await expect(page.getByLabel(/nome completo/i)).toBeVisible()
  })
})
