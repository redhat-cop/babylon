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
  await page.waitForSelector('.ops-workshops-section', { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(3000);

  // 1. Overview — full page light mode
  await page.screenshot({ path: path.join(OUT, 'ops-overview.png'), fullPage: true });
  console.log('✓ ops-overview.png');

  // 2. Workshop table (collapsed)
  const tableSection = page.locator('.ops-workshops-section');
  if (await tableSection.count() > 0) {
    await tableSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await tableSection.screenshot({ path: path.join(OUT, 'ops-workshops-table.png') });
    console.log('✓ ops-workshops-table.png');
  }

  // 3. Expand multi-asset group to show children
  const groupHeaders = page.locator('.ops-group-header');
  const headerCount = await groupHeaders.count();
  let multiAssetExpanded = false;
  for (let i = 0; i < headerCount; i++) {
    const row = groupHeaders.nth(i);
    const multiLabel = row.locator('text=Multi-Asset');
    if (await multiLabel.count() > 0) {
      const expandBtn = row.locator('td:first-child button, td:first-child');
      if (await expandBtn.count() > 0) {
        await expandBtn.first().click();
        await page.waitForTimeout(800);
        multiAssetExpanded = true;
        console.log(`  expanded multi-asset group row ${i}`);
      }
      break;
    }
  }

  if (!multiAssetExpanded) {
    for (let i = 0; i < headerCount; i++) {
      const badge = groupHeaders.nth(i).locator('.pf-v6-c-badge');
      if (await badge.count() > 0) {
        await groupHeaders.nth(i).click();
        await page.waitForTimeout(800);
        console.log(`  expanded group row ${i} (badge)`);
        break;
      }
    }
  }

  // 4. Expanded multi-asset table screenshot
  if (await tableSection.count() > 0) {
    await tableSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await tableSection.screenshot({ path: path.join(OUT, 'ops-multi-asset-expanded.png') });
    console.log('✓ ops-multi-asset-expanded.png');
  }

  // 5. Lock modal
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const lockBtn = page.locator('.ops-grid button:has-text("Lock")').first();
  await lockBtn.click();
  await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 3000 });
  await page.waitForTimeout(300);
  await page.locator('.pf-v6-c-modal-box').first().screenshot({ path: path.join(OUT, 'ops-lock-modal.png') });
  console.log('✓ ops-lock-modal.png');
  await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
  await page.waitForTimeout(300);

  // 6. Unlock modal (should show multi-asset child warning)
  const unlockBtn = page.locator('.ops-grid button:has-text("Unlock")').first();
  await unlockBtn.click();
  await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 3000 });
  await page.waitForTimeout(300);
  await page.locator('.pf-v6-c-modal-box').first().screenshot({ path: path.join(OUT, 'ops-unlock-modal.png') });
  console.log('✓ ops-unlock-modal.png');
  await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
  await page.waitForTimeout(300);

  // 7. Scale modal
  const scaleBtn = page.locator('.ops-grid button:has-text("Scale")').first();
  await scaleBtn.click();
  await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 3000 });
  await page.waitForTimeout(300);
  await page.locator('.pf-v6-c-modal-box').first().screenshot({ path: path.join(OUT, 'ops-scale-modal.png') });
  console.log('✓ ops-scale-modal.png');
  await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
  await page.waitForTimeout(300);

  // 8. Dark mode — full page
  const darkToggle = page.locator('button[aria-label="Toggle dark mode"]');
  await darkToggle.click();
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'ops-dark-mode.png'), fullPage: true });
  console.log('✓ ops-dark-mode.png');
  await darkToggle.click();

  await browser.close();

  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log(`\nAll ${files.length} screenshots saved to ${OUT}`);
  files.forEach(f => {
    const sz = (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0);
    console.log(`  ${f} (${sz} KB)`);
  });
}

run().catch(e => { console.error(e); process.exit(1); });
