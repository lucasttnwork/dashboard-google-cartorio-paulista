import { test, expect } from '@playwright/test'

const TARGET_MONTH = '2025-08'

// Helper para esperar o carregamento dos dados após troca de mês
async function selectMonth(page: any, month: string) {
  await page.getByTestId('month-select').selectOption(month)
  await page.waitForTimeout(800) // pequena espera para chamadas ao Supabase
}

function parseIntSafe(text: string): number {
  const n = parseInt(text.replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? 0 : n
}

function parseFloatSafe(text: string): number {
  const n = parseFloat(text.replace(/[^0-9.,]/g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

test.describe('Dashboard - Agosto 2025', () => {
  test('deve exibir KPIs > 0 e pelo menos 5 colaboradores mencionados', async ({ page }) => {
    await page.goto('/')

    // Garante que o select está renderizado
    await expect(page.getByTestId('month-select')).toBeVisible()

    // Seleciona agosto/2025
    await selectMonth(page, TARGET_MONTH)

    // KPI Total > 0
    const totalText = await page.getByTestId('kpi-total').locator('div:near(:text("Total de Avaliações"))').first().textContent()
    const totalValue = parseIntSafe(totalText || '')
    expect(totalValue).toBeGreaterThan(0)

    // KPI Média ~ 4.x (na prática 4.9x)
    const avgText = await page.getByTestId('kpi-avg').textContent()
    const avgValue = parseFloatSafe(avgText || '')
    expect(avgValue).toBeGreaterThan(0)

    // Colaboradores >= 5
    await expect(page.getByTestId('collaborators-section')).toBeVisible()
    const items = await page.getByTestId('collaborator-item').all()
    expect(items.length).toBeGreaterThanOrEqual(5)
  })
})
