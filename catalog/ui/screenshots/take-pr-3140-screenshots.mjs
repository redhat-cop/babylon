/**
 * PR #3140 — Ops Workshop Control screenshots.
 * Requires: npm run start:dev (webpack dev server), oc login + API proxy as usual.
 * Usage: CATALOG_UI_URL=http://localhost:9000 node screenshots/take-pr-3140-screenshots.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname = catalog/ui/screenshots → babylon repo root is three levels up
const BABYLON_ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(BABYLON_ROOT, 'docs/pr-screenshots');
const BASE = process.env.CATALOG_UI_URL || 'http://localhost:9000';
const NS = process.env.OP_NAMESPACE || 'user-bbethell-redhat-com';

fs.mkdirSync(OUT, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1120 } });
  const page = await ctx.newPage();

  const url = `${BASE}/admin/ops/${NS}`;
  console.log(`Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() =>
    page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }),
  );
  await page.waitForTimeout(2000);

  const hasOps = await page.locator('text=Operations Workshop Control').first().isVisible().catch(() => false);
  if (!hasOps) {
    console.warn(
      '⚠ Ops page did not render (no "Operations Workshop Control"). Start catalog API on port 8001 (webpack proxies /api and /auth), then re-run this script.',
    );
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '3140-ops-overview.png'), fullPage: true });
  console.log('✓ 3140-ops-overview.png');

  // Summary stats bar (seat colors, failed if present)
  const statsBar = page.locator('.ops-summary-bar').first();
  if (await statsBar.count() > 0) {
    await statsBar.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await statsBar.screenshot({ path: path.join(OUT, '3140-ops-summary-stats.png') });
    console.log('✓ 3140-ops-summary-stats.png');
  }

  // Scale Workshops card — remove preference (unused / used only)
  const scaleCard = page.locator('.pf-v6-c-card').filter({ hasText: 'Scale Workshops' }).first();
  if (await scaleCard.count() > 0) {
    await scaleCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    // Lower target count so scale-down UI appears (remove preference row)
    const minusBtn = scaleCard.locator('button[aria-label="Minus"]').first();
    for (let i = 0; i < 8; i++) {
      await minusBtn.click().catch(() => {});
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(400);
    await scaleCard.screenshot({ path: path.join(OUT, '3140-ops-scale-remove-preference.png') });
    console.log('✓ 3140-ops-scale-remove-preference.png');
  }

  // Scale confirm modal (warnings when scaling down)
  const scaleBtn = page.locator('.ops-grid button:has-text("Scale")').first();
  if (await scaleBtn.count() > 0) {
    await scaleBtn.click();
    await page.waitForSelector('.pf-v6-c-modal-box', { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(500);
    const modal = page.locator('.pf-v6-c-modal-box').first();
    if (await modal.count() > 0) {
      await modal.screenshot({ path: path.join(OUT, '3140-ops-scale-confirm-modal.png') });
      console.log('✓ 3140-ops-scale-confirm-modal.png');
    }
    await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').first().click().catch(() => {});
    await page.waitForTimeout(300);
  }

  await browser.close();

  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log(`\n${files.length} PNG(s) in ${OUT}`);
  files.forEach(f => {
    const sz = (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0);
    console.log(`  ${f} (${sz} KB)`);
  });
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
