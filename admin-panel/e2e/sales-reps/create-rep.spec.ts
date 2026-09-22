import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginAsAdmin } from '../fixtures';

/** Live browser coverage for F6's N-1 (input validation) and N-2 (safe error messages) fixes on
 * the "Add a sales rep" flow -- proves the real UI path, not just the unit-tested validation
 * function in isolation. No delete-sales-rep function exists anywhere in this app (checked before
 * writing this test), so any rep this test creates is removed directly via the service-role
 * client afterwards -- same "clean up what you create" convention as storefront's own e2e specs
 * that touch live Supabase data. */

function getServiceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const TEST_REP_MARKER = 'Playwright Test Rep';

test.describe('Create sales rep (F6 N-1/N-2 live coverage)', () => {
  test.afterEach(async () => {
    // Belt-and-braces cleanup -- removes any rep this file's tests created, whether or not the
    // test itself succeeded, identified by the marker name so this can never touch a real rep.
    const supabase = getServiceRoleClient();
    await supabase.from('sales_reps').delete().like('name', `${TEST_REP_MARKER}%`);
  });

  test('N-1: an oversized name is rejected with a validation message, not silently accepted', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/sales-reps');
    await page.getByRole('button', { name: '+ Add rep' }).click();

    await page.getByLabel('Name').fill('a'.repeat(101)); // validateSalesRepInput caps at 100
    await page.getByLabel('Direct phone').fill('555-0100');
    await page.getByLabel('Email').fill('playwright-test@example.com');
    await page.getByRole('button', { name: /save rep/i }).click();

    await expect(page.getByText(/valid name/i)).toBeVisible({ timeout: 10_000 });
    // The modal must still be open -- a rejected submission never closed it or created a rep.
    await expect(page.getByRole('button', { name: /save rep/i })).toBeVisible();
  });

  test('N-1: a control character in the name is rejected', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/sales-reps');
    await page.getByRole('button', { name: '+ Add rep' }).click();

    await page.getByLabel('Name').fill(`${TEST_REP_MARKER}\u0007Bad`);
    await page.getByLabel('Direct phone').fill('555-0100');
    await page.getByLabel('Email').fill('playwright-test@example.com');
    await page.getByRole('button', { name: /save rep/i }).click();

    await expect(page.getByText(/valid name/i)).toBeVisible({ timeout: 10_000 });
  });

  test('a valid rep is created successfully and appears in the directory', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/sales-reps');
    await page.getByRole('button', { name: '+ Add rep' }).click();

    const repName = `${TEST_REP_MARKER} ${Date.now()}`;
    await page.getByLabel('Name').fill(repName);
    await page.getByLabel('Direct phone').fill('555-0100');
    await page.getByLabel('Email').fill('playwright-test@example.com');
    await page.getByRole('button', { name: /save rep/i }).click();

    // Modal closes and the new rep shows up (in the directory card, and in a rep-filter control
    // elsewhere on the page -- both are the same real create, so .first() is enough) -- proves the
    // happy path (valid input passes validateSalesRepInput, no false positive from N-1's fix)
    // still works end to end.
    await expect(page.getByText(repName).first()).toBeVisible({ timeout: 10_000 });
  });
});
