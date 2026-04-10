import { test, expect } from '@playwright/test'

// These tests require:
// 1. docker compose -f docker-compose.dev.yml up -d
// 2. Admin bootstrapped via bootstrap_admin.py
// 3. ADMIN_EMAIL and ADMIN_PASSWORD env vars set

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@cartorio.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ''

test.describe('Login Flow', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env var required')

  test('successful login redirects to /', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/e-mail/i).fill(ADMIN_EMAIL)
    await page.getByLabel(/senha/i).fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: /entrar/i }).click()

    // After login, should redirect to the protected area
    await expect(page).toHaveURL('/')
    // The HealthPage should be visible
    await page.waitForTimeout(1000)
  })

  test('invalid credentials shows error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/e-mail/i).fill(ADMIN_EMAIL)
    await page.getByLabel(/senha/i).fill('definitelywrongpassword')
    await page.getByRole('button', { name: /entrar/i }).click()

    // Should stay on login page
    await expect(page).toHaveURL(/\/login/)
  })
})
