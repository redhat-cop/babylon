import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../docs/dark-mode-screenshots');
const BASE = 'http://localhost:9000';
const NS = 'user-bbethell-redhat-com';

fs.mkdirSync(OUT, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();

  // --- Catalog page (light) ---
  await page.goto(`${BASE}/catalog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'catalog-light.png'), fullPage: false });
  console.log('✓ catalog-light.png');

  // Toggle to dark mode via the masthead button
  const darkToggle = page.locator('[aria-label="Toggle dark mode"]');
  if (await darkToggle.count() > 0) {
    await darkToggle.click();
    await page.waitForTimeout(1000);
  }

  // --- Catalog page (dark) ---
  await page.screenshot({ path: path.join(OUT, 'catalog-dark.png'), fullPage: false });
  console.log('✓ catalog-dark.png');

  // --- Order form page (dark) — shows terms-of-service + admin section ---
  await page.goto(`${BASE}/catalog/babylon-catalog-prod/order/enterprise.ocp4-acc-new-app-dev.prod`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'order-form-dark.png'), fullPage: true });
  console.log('✓ order-form-dark.png');

  // --- Admin Ops page (dark — already in dark mode) ---
  await page.goto(`${BASE}/admin/ops/${NS}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'ops-dark.png'), fullPage: true });
  console.log('✓ ops-dark.png');

  // --- Admin Workshops list (dark) ---
  await page.goto(`${BASE}/admin/workshops/${NS}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'admin-workshops-dark.png'), fullPage: false });
  console.log('✓ admin-workshops-dark.png');

  // --- Services page (dark) ---
  await page.goto(`${BASE}/services`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'services-dark.png'), fullPage: false });
  console.log('✓ services-dark.png');

  // Toggle back to light
  const lightToggle = page.locator('[aria-label="Toggle dark mode"]');
  if (await lightToggle.count() > 0) {
    await lightToggle.click();
    await page.waitForTimeout(1000);
  }

  // --- Services page (light) ---
  await page.screenshot({ path: path.join(OUT, 'services-light.png'), fullPage: false });
  console.log('✓ services-light.png');

  // --- Masthead close-up (light) showing the toggle ---
  await page.goto(`${BASE}/catalog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const masthead = page.locator('.pf-v6-c-masthead');
  if (await masthead.count() > 0) {
    await masthead.screenshot({ path: path.join(OUT, 'masthead-light.png') });
    console.log('✓ masthead-light.png');
  }

  // Toggle dark again for masthead shot
  if (await darkToggle.count() > 0) {
    await darkToggle.click();
    await page.waitForTimeout(1000);
  }
  if (await masthead.count() > 0) {
    await masthead.screenshot({ path: path.join(OUT, 'masthead-dark.png') });
    console.log('✓ masthead-dark.png');
  }

  await browser.close();

  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log(`\nAll ${files.length} screenshots saved to ${OUT}`);
  files.forEach(f => {
    const sz = (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0);
    console.log(`  ${f} (${sz} KB)`);
  });
}

run().catch(e => { console.error(e); process.exit(1); });
