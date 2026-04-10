import { test, expect } from '@playwright/test'

test.describe('Collaborators Merge', () => {
  test.beforeEach(async ({ page }) => {
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
        body: JSON.stringify({
          items: [
            {
              id: 1,
              full_name: 'Ana Sophia',
              aliases: ['Ana'],
              department: 'E-notariado',
              position: null,
              is_active: true,
              mention_count: 100,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
            {
              id: 2,
              full_name: 'Ana S.',
              aliases: [],
              department: 'E-notariado',
              position: null,
              is_active: true,
              mention_count: 30,
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
  })

  test('merge button opens merge dialog', async ({ page }) => {
    await page.goto('/admin/collaborators')
    await page.getByRole('button', { name: /merge/i }).click()
    await expect(page.getByText(/merge de colaboradores/i)).toBeVisible()
    await expect(page.getByText(/essa ação não pode ser desfeita/i)).toBeVisible()
  })
})
