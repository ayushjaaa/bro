import { test, expect } from '@playwright/test';
import { loginAsAdmin, TEST_ADMIN_EMAIL } from '../fixtures';

const ADMIN_LOCAL_PART = TEST_ADMIN_EMAIL.split('@')[0];

test.describe('Admin login', () => {
  test('a real admin can log in and reach the dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    // The dashboard renders SOMETHING that only exists once requireAdmin() has passed and the
    // real page.tsx rendered -- DashboardHero greets the signed-in admin by email's local part.
    await expect(page.getByRole('heading', { name: new RegExp(`welcome back, ${ADMIN_LOCAL_PART}`, 'i') })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('wrong password is rejected with a generic message, session never starts', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(TEST_ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill('definitely-wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/incorrect email or password/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('visiting the dashboard while logged out redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
