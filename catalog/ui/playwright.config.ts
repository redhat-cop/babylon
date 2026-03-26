import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:9000',
    trace: 'on-first-retry',
    headless: false, // Use headed mode as requested
    video: 'retain-on-failure',
    // Add auth headers to bypass authentication in tests
    extraHTTPHeaders: {
      'Authorization': 'Bearer test-token',
      'X-Test-User': 'admin',
      'X-Test-Admin': 'true'
    }
  },

  projects: [
    // Setup project to handle authentication
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use the auth state from setup
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run start:dev',
    url: 'http://localhost:9000',
    reuseExistingServer: !process.env.CI,
  },
});