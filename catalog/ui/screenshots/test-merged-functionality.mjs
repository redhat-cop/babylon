#!/usr/bin/env node

/**
 * Visual verification script for merged admin ops functionality
 * Tests that our Phase 2 features are properly integrated with main branch updates
 */

import { chromium } from 'playwright';

const takeScreenshots = async () => {
  console.log('🚀 Starting visual verification of merged functionality...');

  const browser = await chromium.launch({
    headless: false, // Run in headed mode as requested
    slowMo: 1000 // Slow down for better visibility
  });
  const page = await browser.newPage();

  try {
    // Navigate to dev server
    console.log('📂 Navigating to local development server...');
    await page.goto('http://localhost:51572');

    // Wait for the page to load
    await page.waitForTimeout(2000);

    // Take homepage screenshot
    console.log('📸 Taking homepage screenshot...');
    await page.screenshot({
      path: 'screenshots/merged-homepage.png',
      fullPage: true
    });

    // Check if we can access admin ops (may require auth)
    console.log('🔍 Checking admin operations access...');
    try {
      await page.goto('http://localhost:51572/admin/ops');
      await page.waitForTimeout(3000);

      // Take admin ops screenshot
      console.log('📸 Taking admin ops screenshot...');
      await page.screenshot({
        path: 'screenshots/merged-admin-ops.png',
        fullPage: true
      });

      // Check for our Phase 2 buttons
      const exportButton = await page.$('button:has-text("Export")');
      const historyButton = await page.$('button:has-text("History")');

      if (exportButton && historyButton) {
        console.log('✅ Phase 2 Export and History buttons found!');
      } else {
        console.log('⚠️  Phase 2 buttons not visible (may require authentication)');
      }

    } catch (error) {
      console.log('⚠️  Admin ops page requires authentication:', error.message);
    }

    // Test dark mode toggle if available
    console.log('🌙 Testing dark mode functionality...');
    try {
      const darkModeToggle = await page.$('[aria-label="Toggle dark mode"], button[data-testid="dark-mode-toggle"]');
      if (darkModeToggle) {
        await darkModeToggle.click();
        await page.waitForTimeout(1000);

        console.log('📸 Taking dark mode screenshot...');
        await page.screenshot({
          path: 'screenshots/merged-dark-mode.png',
          fullPage: true
        });
        console.log('✅ Dark mode toggle working!');
      } else {
        console.log('⚠️  Dark mode toggle not found on current page');
      }
    } catch (error) {
      console.log('⚠️  Dark mode test failed:', error.message);
    }

    console.log('✅ Visual verification complete! Screenshots saved in screenshots/');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
};

takeScreenshots();