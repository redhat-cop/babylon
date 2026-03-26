import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../docs/ops-screenshots');
const BASE = 'http://localhost:9000';
const NS = 'user-bbethell-redhat-com';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1120 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/admin/ops/${NS}`, { waitUntil: 'networkidle' });
  // Wait for workshops to load
  await page.waitForSelector('.ops-workshops-section', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(2000);

  // 1. Overview — full page light mode
  await page.screenshot({ path: path.join(OUT, 'ops-overview.png'), fullPage: true });
  console.log('✓ ops-overview.png');

  // 2. Workshop table
  const tableSection = page.locator('.ops-workshops-section');
  if (await tableSection.count() > 0) {
    await tableSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Expand a multi-item group if there is one
    const groupHeaders = page.locator('.ops-group-header');
    const headerCount = await groupHeaders.count();
    for (let i = 0; i < headerCount; i++) {
      const badge = groupHeaders.nth(i).locator('.pf-v6-c-badge');
      if (await badge.count() > 0) {
        await groupHeaders.nth(i).click();
        await page.waitForTimeout(500);
        break;
      }
    }

    await tableSection.screenshot({ path: path.join(OUT, 'ops-workshops-table.png') });
    console.log('✓ ops-workshops-table.png');
  } else {
    console.log('✗ ops-workshops-section not found, skipping table screenshot');
  }

  // 3. Lock modal
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const lockBtn = page.locator('.ops-grid button:has-text("Lock")').first();
  await lockBtn.click();
  await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 3000 });
  await page.waitForTimeout(300);
  const lockModal = page.locator('.pf-v6-c-modal-box').first();
  await lockModal.screenshot({ path: path.join(OUT, 'ops-lock-modal.png') });
  console.log('✓ ops-lock-modal.png');
  await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
  await page.waitForTimeout(300);

  // 4. Scale modal
  const scaleBtn = page.locator('.ops-grid button:has-text("Scale")').first();
  await scaleBtn.click();
  await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 3000 });
  await page.waitForTimeout(300);
  const scaleModal = page.locator('.pf-v6-c-modal-box').first();
  await scaleModal.screenshot({ path: path.join(OUT, 'ops-scale-modal.png') });
  console.log('✓ ops-scale-modal.png');
  await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
  await page.waitForTimeout(300);

  // 5. Dark mode — full page
  const darkToggle = page.locator('button[aria-label="Toggle dark mode"]');
  await darkToggle.click();
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'ops-dark-mode.png'), fullPage: true });
  console.log('✓ ops-dark-mode.png');
  await darkToggle.click();

  await browser.close();
  console.log(`\nAll screenshots saved to ${OUT}`);
}

run().catch(e => { console.error(e); process.exit(1); });
