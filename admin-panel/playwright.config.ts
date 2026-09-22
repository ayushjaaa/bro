import { defineConfig, devices } from '@playwright/test';

// Load .env.local the same way storefront's config does -- specs need SUPABASE_SERVICE_ROLE_KEY
// (e.g. to seed/clean up test data) and the admin-panel's own Shopify/Supabase env.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local -- fine for specs that don't need direct DB/Shopify access.
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Every spec shares one live Supabase project and one fixed test-admin account -- running
  // concurrently risks one test's sign-in/sign-out racing another's, same reasoning as
  // storefront's own config.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
