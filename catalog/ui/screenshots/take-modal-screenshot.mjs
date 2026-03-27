import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../docs/ops-screenshots');
const BASE = 'http://localhost:9000';
const NS = 'user-bbethell-redhat-com';

fs.mkdirSync(OUT, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1120 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/admin/ops/${NS}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ops-workshops-section', { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(4000);

  // Scale modal (scale up)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const scaleCard = page.locator('.pf-v6-c-card:has-text("Scale Workshops")');
  const scaleBtn = page.getByRole('button', { name: 'Scale', exact: true });
  if (await scaleBtn.count() > 0) {
    await scaleBtn.first().click();
    await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.locator('.pf-v6-c-modal-box').first().screenshot({ path: path.join(OUT, 'ops-scale-modal-polished.png') });
    console.log('✓ ops-scale-modal-polished.png');
    await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
    await page.waitForTimeout(300);
  }

  // Lock modal
  const lockBtn = page.locator('.ops-grid button:has-text("Lock")').first();
  await lockBtn.click();
  await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 3000 });
  await page.waitForTimeout(500);
  await page.locator('.pf-v6-c-modal-box').first().screenshot({ path: path.join(OUT, 'ops-lock-modal-polished.png') });
  console.log('✓ ops-lock-modal-polished.png');
  await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
  await page.waitForTimeout(300);

  // Scale down modal
  const minusBtn = scaleCard.locator('button[aria-label="Minus"]');
  for (let i = 0; i < 10; i++) {
    if (await minusBtn.isDisabled()) break;
    await minusBtn.click();
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);
  const scaleZeroBtn = page.getByRole('button', { name: 'Scale to Zero', exact: true }).first();
  if (await scaleZeroBtn.count() > 0) {
    await scaleZeroBtn.click();
    await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.locator('.pf-v6-c-modal-box').first().screenshot({ path: path.join(OUT, 'ops-scale-zero-polished.png') });
    console.log('✓ ops-scale-zero-polished.png');
    await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
    await page.waitForTimeout(300);
  }

  // Dark mode — repeat scale modal
  const darkToggle = page.locator('button[aria-label*="dark mode"]');
  if (await darkToggle.count() > 0) {
    await darkToggle.click();
    await page.waitForTimeout(1000);
  }
  const plusBtn = scaleCard.locator('button[aria-label="Plus"]');
  for (let i = 0; i < 5; i++) await plusBtn.click();
  await page.waitForTimeout(300);
  const scaleBtn2 = page.getByRole('button', { name: 'Scale', exact: true });
  if (await scaleBtn2.count() > 0) {
    await scaleBtn2.first().click();
    await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.locator('.pf-v6-c-modal-box').first().screenshot({ path: path.join(OUT, 'ops-scale-modal-dark.png') });
    console.log('✓ ops-scale-modal-dark.png');
    await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
  }
  if (await darkToggle.count() > 0) await darkToggle.click();

  await browser.close();

  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log(`\n${files.length} screenshots in ${OUT}`);
  files.filter(f => f.includes('polished') || f.includes('dark')).forEach(f => {
    const sz = (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0);
    console.log(`  ${f} (${sz} KB)`);
  });
}

run().catch(e => { console.error(e); process.exit(1); });
