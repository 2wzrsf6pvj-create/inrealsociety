import { defineConfig, devices } from '@playwright/test';

// Config minimale pour smoke tests E2E. Le webServer démarre Next dev (avec
// placeholder Supabase via supabase-config) pour tester les pages publiques.
// Les tests qui nécessitent Stripe/Supabase réels doivent être en .skip() ou
// gated derrière une env var TEST_E2E_FULL=1.

export default defineConfig({
  testDir:  './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries:  process.env.CI ? 2 : 0,
  workers:  process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout:  30_000,

  use: {
    baseURL:    process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace:      'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command:           'npm run dev',
    url:               'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout:           60_000,
  },
});
