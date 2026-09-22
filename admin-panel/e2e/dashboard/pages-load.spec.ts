import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures';

/** Broad, cheap smoke coverage: every dashboard page loads for a real logged-in admin, with no
 * crash and no bounce back to /login (which would mean requireAdmin() failed). Doesn't test each
 * page's specific behavior in depth -- that's for dedicated specs -- just that the route renders
 * at all, which catches a whole class of regression (a broken import, a thrown error in a Server
 * Component, an accidentally-removed admin gate) cheaply across the entire app. */
const DASHBOARD_ROUTES = ['/', '/customers', '/products', '/activity', '/taxonomy', '/cart', '/sales-reps'];

test.describe('Dashboard pages load for a real admin', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  for (const route of DASHBOARD_ROUTES) {
    test(`${route} loads without crashing or redirecting to /login`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.ok(), `${route} should respond OK`).toBe(true);
      await expect(page).not.toHaveURL(/\/login/);
      // Next.js error overlay/digest text would indicate a Server Component crash.
      await expect(page.getByText(/application error|unhandled runtime error/i)).toHaveCount(0);
    });
  }
});
