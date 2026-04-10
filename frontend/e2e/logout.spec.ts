import { test, expect } from '@playwright/test'

// Requires admin bootstrapped + ADMIN_EMAIL / ADMIN_PASSWORD env vars.

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@cartorio.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ''

test.describe('Logout Flow', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env var required')

  test('after login then navigating away, session persists via cookies', async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.getByLabel(/e-mail/i).fill(ADMIN_EMAIL)
    await page.getByLabel(/senha/i).fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: /entrar/i }).click()
    await expect(page).toHaveURL('/')

    // Verify cookies are set
    const cookies = await page.context().cookies()
    const accessCookie = cookies.find((c) => c.name === 'sb_access')
    expect(accessCookie).toBeDefined()
    expect(accessCookie?.httpOnly).toBe(true)
  })
})
