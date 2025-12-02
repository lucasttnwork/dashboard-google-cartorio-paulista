/*
 Minimal audit runner using Playwright to capture screenshots and basic checks
 Run with: node scripts/audit-e2e.js
 Outputs screenshots to .playwright-mcp/
*/

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT_DIR = path.resolve(process.cwd(), '.playwright-mcp');

/** Ensure output directory exists */
function ensureOutDir() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }
}

/** Save JSON to file nicely */
function saveJSON(filename, data) {
  fs.writeFileSync(path.join(OUT_DIR, filename), JSON.stringify(data, null, 2), 'utf8');
}

async function takeShot(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true });
}

async function waitIdle(page) {
  // Give the app a moment for client-side hydration and data fetching
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch (_) {
    // ignore; continue best-effort
  }
}

async function selectPeriod(page, label) {
  // Try the first combobox on page
  const combo = page.getByRole('combobox').first();
  if (await combo.count() === 0) return false;
  await combo.click();
  const option = page.getByRole('option', { name: label });
  if (await option.count()) {
    await option.click();
    await waitIdle(page);
    return true;
  }
  return false;
}

async function run() {
  ensureOutDir();
  const consoleLogs = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  // Dashboard recap (sanity)
  await page.goto(BASE_URL);
  await waitIdle(page);
  await takeShot(page, 'dashboard-recap.png');

  // Trends
  await page.goto(`${BASE_URL}/trends`);
  await waitIdle(page);
  await takeShot(page, 'trends-inicial.png');
  await selectPeriod(page, 'Últimos 7 dias');
  await takeShot(page, 'trends-7d.png');
  await selectPeriod(page, 'Últimos 90 dias');
  await takeShot(page, 'trends-90d.png');

  // Reviews
  await page.goto(`${BASE_URL}/reviews`);
  await waitIdle(page);
  // Count rows if table exists
  let rowCount = null;
  try {
    rowCount = await page.locator('table tbody tr').count();
  } catch (_) {
    // ignore if table selector differs
  }
  await takeShot(page, 'reviews-inicial.png');
  // Sort by columns if headers exist
  for (const col of ['Data', 'Avaliação', 'Avaliador']) {
    const header = page.getByRole('columnheader', { name: col });
    if (await header.count()) {
      await header.first().click();
      await waitIdle(page);
    }
  }
  await takeShot(page, 'reviews-ordenadas.png');
  // Try export CSV if button/link exists
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 3000 }).catch(() => null),
      page.getByRole('button', { name: /export/i }).first().click().catch(() => null),
    ]);
    if (download) {
      const filePath = path.join(OUT_DIR, 'reviews-export.csv');
      await download.saveAs(filePath);
    }
  } catch (_) {
    // ignore
  }

  // Collaborators
  await page.goto(`${BASE_URL}/collaborators`);
  await waitIdle(page);
  await takeShot(page, 'collaborators.png');

  // Analytics
  await page.goto(`${BASE_URL}/analytics`);
  await waitIdle(page);
  await takeShot(page, 'analytics.png');

  // Reports
  await page.goto(`${BASE_URL}/reports`);
  await waitIdle(page);
  await takeShot(page, 'reports.png');

  // Quick responsiveness check (mobile)
  await context.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL);
  await waitIdle(page);
  await takeShot(page, 'dashboard-mobile.png');
  await page.goto(`${BASE_URL}/reviews`);
  await waitIdle(page);
  await takeShot(page, 'reviews-mobile.png');

  // Save artifacts
  saveJSON('console.json', consoleLogs);
  saveJSON('reviews-meta.json', { rowCount });

  await browser.close();
}

run().catch((err) => {
  ensureOutDir();
  fs.writeFileSync(path.join(OUT_DIR, 'audit-error.txt'), String(err && err.stack || err), 'utf8');
  process.exitCode = 1;
});



