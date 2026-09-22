import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Seeded by scripts/supabase/_tmp-create-test-admin.ts -- a real Auth user with a matching
 * admin_users row, dedicated to automated tests. Not a production account. */
export const TEST_ADMIN_EMAIL = 'automation-test-admin@example.com';
export const TEST_ADMIN_PASSWORD = 'TestAutomation123!';

/** Logs in as the seeded test admin via the real /login form -- no shortcuts (no direct cookie
 * injection, no skipping requireAdmin()) so this actually exercises the same sign-in path a real
 * admin uses. Waits out the first-login success overlay (LoginSuccessOverlay, ~900ms) and confirms
 * the dashboard actually loaded (URL settles on '/', not bounced back to '/login' by
 * requireAdmin() failing). */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  // The login form's <label> isn't programmatically associated with its <input> (no htmlFor/id),
  // so getByLabel can't find it -- select by input type instead, same fields either way.
  await page.locator('input[type="email"]').fill(TEST_ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  // First login on a fresh browser context always shows the success overlay before navigating
  // (LoginSuccessOverlay, SUCCESS_OVERLAY_MS = 900) -- wait for the real destination, not a fixed
  // sleep, so this stays robust if that delay ever changes.
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
  // Confirms requireAdmin() actually passed (a failed check redirects back to /login) rather than
  // just trusting the URL alone.
  await expect(page).not.toHaveURL(/\/login/);
}
