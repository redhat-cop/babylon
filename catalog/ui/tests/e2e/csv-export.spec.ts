import { test, expect } from '@playwright/test';

test.describe('CSV Export Functionality', () => {
  test('should show export modal for workshops', async ({ page }) => {
    // Navigate to admin ops page
    await page.goto('/admin/ops');

    // Wait for the page to load
    await page.waitForSelector('[data-testid="operations-panel"]', { timeout: 10000 });

    // Click the Export button
    await page.click('button:has-text("Export")');

    // Should show export modal
    await expect(page.locator('.pf-c-modal')).toBeVisible();
    await expect(page.locator('text=Export Workshop Data')).toBeVisible();

    // Should show filename input
    await expect(page.locator('input[id="filename"]')).toBeVisible();

    // Should show column selection checkboxes
    await expect(page.locator('text=Workshop Name')).toBeVisible();
    await expect(page.locator('text=Namespace')).toBeVisible();
    await expect(page.locator('text=Status')).toBeVisible();

    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/export-modal.png' });

    // Close modal
    await page.click('button:has-text("Cancel")');
  });

  test('should show operation history export', async ({ page }) => {
    await page.goto('/admin/ops');

    // Wait for page load
    await page.waitForSelector('button:has-text("History")', { timeout: 10000 });

    // Click History button
    await page.click('button:has-text("History")');

    // Should show history panel
    await expect(page.locator('text=Operation History')).toBeVisible();

    // Should show export button in history panel
    await expect(page.locator('button:has-text("Export CSV")')).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'test-results/history-panel.png' });
  });

  test('should demonstrate column selection', async ({ page }) => {
    await page.goto('/admin/ops');

    // Open export modal
    await page.click('button:has-text("Export")');
    await page.waitForSelector('.pf-c-modal');

    // Should show Select All/Deselect All functionality
    await expect(page.locator('button:has-text("Deselect All")')).toBeVisible();

    // Click a few checkboxes to demonstrate selection
    await page.click('input[id="column-workshopName"]');
    await page.click('input[id="column-namespace"]');
    await page.click('input[id="column-status"]');

    // Take screenshot of column selection
    await page.screenshot({ path: 'test-results/column-selection.png' });

    // Verify selection count updates
    await expect(page.locator('text*=of')).toBeVisible();
  });
});