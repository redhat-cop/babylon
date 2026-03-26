import { test, expect } from '@playwright/test';

test.describe('Admin Ops Interface', () => {
  test('should load admin operations page', async ({ page }) => {
    await page.goto('/admin/ops');

    // Wait for the page to load
    await expect(page.locator('h1')).toContainText('Operations');

    // Check for key elements
    await expect(page.locator('[data-testid="project-selector"]')).toBeVisible();
    await expect(page.locator('[data-testid="operations-panel"]')).toBeVisible();
  });

  test('should show bulk operation templates', async ({ page }) => {
    await page.goto('/admin/ops');

    // Check for template management
    await expect(page.locator('[data-testid="template-manager-button"]')).toBeVisible();

    // Open template manager
    await page.click('[data-testid="template-manager-button"]');

    // Should show default templates
    await expect(page.locator('.template-item')).toHaveCount(12);
  });

  test('should perform bulk lock operation with confirmation', async ({ page }) => {
    await page.goto('/admin/ops');

    // Select some workshops first
    // This would depend on having test data available

    // Click lock button
    await page.click('[data-testid="bulk-lock-button"]');

    // Should show confirmation modal
    await expect(page.locator('.pf-c-modal')).toBeVisible();

    // Cancel to avoid actually locking anything
    await page.click('[data-testid="cancel-button"]');
  });

  test('should filter workshops by namespace', async ({ page }) => {
    await page.goto('/admin/ops');

    // Open namespace filter
    await page.click('[data-testid="namespace-filter"]');

    // Should show namespace options
    await expect(page.locator('.pf-c-select__list')).toBeVisible();
  });
});