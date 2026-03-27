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

  // 1. Full overview (light) — shows summary bar with seat colors
  await page.screenshot({ path: path.join(OUT, 'ops-overview-seats.png'), fullPage: true });
  console.log('✓ ops-overview-seats.png');

  // 2. Summary bar close-up — seat fill + Failed stat
  const summaryBar = page.locator('.ops-summary-bar');
  if (await summaryBar.count() > 0) {
    await summaryBar.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await summaryBar.screenshot({ path: path.join(OUT, 'ops-summary-bar.png') });
    console.log('✓ ops-summary-bar.png');
  }

  // 3. Hover over Failed stat to show tooltip
  const failedStat = page.locator('.ops-stat-attention').first();
  if (await failedStat.count() > 0) {
    await failedStat.hover();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'ops-failed-tooltip.png') });
    console.log('✓ ops-failed-tooltip.png');

    // 4. Click Failed to activate filter
    await failedStat.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, 'ops-failed-filter.png'), fullPage: true });
    console.log('✓ ops-failed-filter.png');

    // Click again to deactivate
    await failedStat.click();
    await page.waitForTimeout(500);
  } else {
    console.log('  (no failed workshops to screenshot)');
  }

  // 5. Workshop table close-up — seat colors in rows
  const tableSection = page.locator('.ops-workshops-section');
  if (await tableSection.count() > 0) {
    await tableSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await tableSection.screenshot({ path: path.join(OUT, 'ops-table-seats.png') });
    console.log('✓ ops-table-seats.png');
  }

  // 6. Scale card — scale down to 0 to always trigger isScaleZero + "Remove preference"
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const scaleCard = page.locator('.pf-v6-c-card:has-text("Scale Workshops")');
  if (await scaleCard.count() > 0) {
    const minusBtn = scaleCard.locator('button[aria-label="Minus"]');
    for (let i = 0; i < 10; i++) {
      const isDisabled = await minusBtn.isDisabled();
      if (isDisabled) break;
      await minusBtn.click();
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(500);

    // Now at 0 — "Remove preference" should show (isScaleZero = true)
    const prefSelect = scaleCard.locator('select[aria-label="Scale down preference"]');
    if (await prefSelect.count() > 0) {
      console.log('  Remove preference selector visible');
      await scaleCard.screenshot({ path: path.join(OUT, 'ops-scale-zero-pref.png') });
      console.log('✓ ops-scale-zero-pref.png');
    }

    // 7. Scale to Zero confirm modal
    const scaleZeroBtn = page.getByRole('button', { name: 'Scale to Zero', exact: true }).first();
    if (await scaleZeroBtn.count() > 0) {
      await scaleZeroBtn.click();
      await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 5000 });
      await page.waitForTimeout(300);
      await page.locator('.pf-v6-c-modal-box').first().screenshot({ path: path.join(OUT, 'ops-scale-zero-modal.png') });
      console.log('✓ ops-scale-zero-modal.png');
      await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
      await page.waitForTimeout(300);
    }

    // 8. Set to specific count for scale-down if workshops have instances > 1
    const plusBtn = scaleCard.locator('button[aria-label="Plus"]');
    await plusBtn.click(); // count = 1
    await page.waitForTimeout(200);

    // Check if "Remove preference" still shows (only if isScaleDown)
    if (await prefSelect.count() > 0) {
      // Change preference to "Used first" and screenshot the card
      await prefSelect.selectOption('used');
      await page.waitForTimeout(300);
      await scaleCard.screenshot({ path: path.join(OUT, 'ops-scale-down-used-pref.png') });
      console.log('✓ ops-scale-down-used-pref.png');

      // Open the scale-down modal with "used first" preference
      const actionBtn = scaleCard.locator('.pf-v6-c-card__body > div:last-child button.pf-v6-c-button').last();
      await actionBtn.click({ timeout: 5000 });
      await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(300);
      const modal = page.locator('.pf-v6-c-modal-box');
      if (await modal.count() > 0) {
        await modal.first().screenshot({ path: path.join(OUT, 'ops-scale-down-used-danger.png') });
        console.log('✓ ops-scale-down-used-danger.png');
        await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
        await page.waitForTimeout(300);
      }

      // Reset preference to unused and take screenshot
      await prefSelect.selectOption('unused');
      await page.waitForTimeout(200);
      await actionBtn.click({ timeout: 5000 });
      await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(300);
      if (await modal.count() > 0) {
        await modal.first().screenshot({ path: path.join(OUT, 'ops-scale-down-unused.png') });
        console.log('✓ ops-scale-down-unused.png');
        await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
        await page.waitForTimeout(300);
      }
    }
  }

  // 9. Dark mode — full page
  const darkToggle = page.locator('button[aria-label*="dark mode"]');
  if (await darkToggle.count() > 0) {
    await darkToggle.click();
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'ops-dark-mode-seats.png'), fullPage: true });
    console.log('✓ ops-dark-mode-seats.png');
    await darkToggle.click();
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
