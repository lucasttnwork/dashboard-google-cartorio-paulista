import { test, expect } from '@playwright/test'

test.describe('Reviews Page', () => {
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

    // Mock reviews list endpoint
    await page.route('**/api/v1/reviews?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              review_id: 'rev-001',
              rating: 5,
              comment: 'Excelente atendimento da Ana Sophia!',
              reviewer_name: 'Maria Silva',
              is_anonymous: false,
              create_time: '2026-03-15T10:00:00Z',
              sentiment: 'pos',
              reply_text: 'Obrigado pela avaliação!',
              collaborator_names: ['Ana Sophia'],
              review_url: null,
            },
            {
              review_id: 'rev-002',
              rating: 4,
              comment: 'Bom serviço, rápido e eficiente.',
              reviewer_name: 'João Santos',
              is_anonymous: false,
              create_time: '2026-03-14T14:30:00Z',
              sentiment: 'pos',
              reply_text: null,
              collaborator_names: [],
              review_url: null,
            },
          ],
          total: 2,
          has_more: false,
          next_cursor: null,
        }),
      })
    )

    // Mock reviews endpoint without query params (initial load)
    await page.route('**/api/v1/reviews', (route) => {
      if (route.request().url().includes('?')) return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          total: 0,
          has_more: false,
          next_cursor: null,
        }),
      })
    })
  })

  test('navigates to /reviews', async ({ page }) => {
    await page.goto('/reviews')
    await expect(page).toHaveURL(/\/reviews/)
  })

  test('shows PT-BR page title "Avaliações"', async ({ page }) => {
    await page.goto('/reviews')
    await expect(
      page.getByRole('heading', { name: /avaliações/i })
    ).toBeVisible()
  })

  test('renders search input with PT-BR placeholder', async ({ page }) => {
    await page.goto('/reviews')
    await expect(
      page.getByPlaceholder(/buscar por comentário ou avaliador/i)
    ).toBeVisible()
  })

  test('renders rating filter select', async ({ page }) => {
    await page.goto('/reviews')
    // The SelectTrigger displays "Todas as notas" as the default value
    await expect(page.getByText(/todas as notas/i)).toBeVisible()
  })

  test('displays review cards from mocked data', async ({ page }) => {
    await page.goto('/reviews')
    await expect(page.getByText('Maria Silva')).toBeVisible()
    await expect(
      page.getByText(/excelente atendimento/i)
    ).toBeVisible()
  })
})
