import { test, expect } from '@playwright/test'

test.describe('Auth Guard', () => {
  test('redirects unauthenticated user from / to /login', async ({ page }) => {
    await page.goto('/')
    // RequireAuth should redirect to /login
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows login form on /login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel(/e-mail/i)).toBeVisible()
    await expect(page.getByLabel(/senha/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible()
  })
})
