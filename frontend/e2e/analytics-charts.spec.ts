import { test, expect } from '@playwright/test'

test.describe('Analytics Page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth — bypass RequireAuth guard
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

    // Mock trends endpoint
    await page.route('**/api/v1/metrics/trends*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          months: [
            { month: '2026-01-01', total_reviews: 120, avg_rating: 4.85, reviews_enotariado: 30 },
            { month: '2026-02-01', total_reviews: 135, avg_rating: 4.90, reviews_enotariado: 35 },
            { month: '2026-03-01', total_reviews: 140, avg_rating: 4.88, reviews_enotariado: 40 },
          ],
        }),
      })
    )

    // Mock collaborator mentions endpoint
    await page.route('**/api/v1/metrics/collaborator-mentions*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          collaborators: [
            { collaborator_id: 1, full_name: 'Ana Sophia', total_mentions: 150, avg_rating_mentioned: 4.95, is_active: true },
            { collaborator_id: 2, full_name: 'Karen Figueiredo', total_mentions: 80, avg_rating_mentioned: 4.80, is_active: true },
            { collaborator_id: 3, full_name: 'Pedro Almeida', total_mentions: 45, avg_rating_mentioned: 4.70, is_active: false },
          ],
        }),
      })
    )
  })

  test('navigates to /analytics', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page).toHaveURL(/\/analytics/)
  })

  test('shows PT-BR page title "Análises"', async ({ page }) => {
    await page.goto('/analytics')
    await expect(
      page.getByRole('heading', { name: /análises/i })
    ).toBeVisible()
  })

  test('renders period selector with default value', async ({ page }) => {
    await page.goto('/analytics')
    // The period Select defaults to 12 months — "Últimos 12 meses"
    await expect(page.getByText(/últimos 12 meses/i)).toBeVisible()
  })

  test('renders collaborator table section', async ({ page }) => {
    await page.goto('/analytics')

    await expect(
      page.getByText('Desempenho dos Colaboradores')
    ).toBeVisible()

    // Collaborator rows from mock data
    await expect(page.getByText('Ana Sophia')).toBeVisible()
    await expect(page.getByText('Karen Figueiredo')).toBeVisible()
  })

  test('renders chart sections', async ({ page }) => {
    await page.goto('/analytics')

    await expect(
      page.getByText('Tendência da Nota Média')
    ).toBeVisible()
    await expect(
      page.getByText('Avaliações E-notariado vs. Outras')
    ).toBeVisible()
  })

  test('include-inactive toggle is present', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page.getByLabel(/incluir inativos/i)).toBeVisible()
  })
})
