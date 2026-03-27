import { test, expect } from '@playwright/test';

test.describe('Basic Application Functionality', () => {
  test('should load the application homepage', async ({ page }) => {
    await page.goto('/');

    // Wait for the application to load
    await expect(page).toHaveTitle(/Babylon/);

    // Take a screenshot for visual verification (headed mode will show this)
    await page.screenshot({ path: 'test-results/homepage.png' });
  });

  test('should navigate to admin section', async ({ page }) => {
    await page.goto('/admin');

    // Check for admin interface elements
    await expect(page.locator('h1')).toBeVisible();

    // Take screenshot in headed mode
    await page.screenshot({ path: 'test-results/admin-page.png' });
  });
});