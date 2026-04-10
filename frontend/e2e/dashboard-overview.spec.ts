import { test, expect } from '@playwright/test'

test.describe('Dashboard Overview', () => {
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

    // Mock metrics overview endpoint
    await page.route('**/api/v1/metrics/overview*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_reviews: 1250,
          avg_rating: 4.87,
          five_star_pct: 92.3,
          total_enotariado: 310,
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
          ],
        }),
      })
    )
  })

  test('navigates to /dashboard after login redirect', async ({ page }) => {
    await page.goto('/')
    // The index route redirects to /dashboard
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('shows PT-BR page title "Painel Geral"', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(
      page.getByRole('heading', { name: /painel geral/i })
    ).toBeVisible()
  })

  test('renders 4 KPI card areas', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(page.getByText('Total de Avaliações')).toBeVisible()
    await expect(page.getByText('Nota Média')).toBeVisible()
    await expect(page.getByText('Avaliações 5 Estrelas')).toBeVisible()
    await expect(page.getByText('Avaliações E-notariado')).toBeVisible()
  })

  test('renders chart section with month labels', async ({ page }) => {
    await page.goto('/dashboard')

    // The chart card titles
    await expect(page.getByText('Avaliações por Mês')).toBeVisible()
    await expect(page.getByText('Evolução da Nota Média')).toBeVisible()
  })

  test('renders collaborators mini-table', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(
      page.getByText('Colaboradores Mais Mencionados')
    ).toBeVisible()
    await expect(page.getByText('Ana Sophia')).toBeVisible()
    await expect(page.getByText('Karen Figueiredo')).toBeVisible()
  })
})
