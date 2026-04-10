import { test, expect } from '@playwright/test'

test.describe('Collaborators Role Guard', () => {
  test('viewer role is redirected away from /admin/collaborators', async ({ page }) => {
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-0000-0000-000000000002',
          email: 'viewer@test.com',
          role: 'viewer',
          created_at: '2026-01-01T00:00:00Z',
          app_metadata: {},
        }),
      })
    )

    await page.goto('/admin/collaborators')
    // RequireRole should redirect viewer to /
    await expect(page).toHaveURL(/^\/$/)
  })

  test('admin role can access /admin/collaborators', async ({ page }) => {
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
    await expect(page.getByRole('heading', { name: /colaboradores/i })).toBeVisible()
  })
})
