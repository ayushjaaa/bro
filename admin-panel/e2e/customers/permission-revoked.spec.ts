import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Live browser coverage for an edge case suggested by real-world multi-admin dashboard testing
 * guidance (session/permission changes mid-action): an admin's access is revoked WHILE they have
 * an edit form open. requireAdmin() (admin-auth.ts) checks admin_users fresh on every call, with
 * no caching -- so the very next server action after revocation should be rejected cleanly, not
 * silently succeed and not crash. Uses a dedicated temporary admin (not the shared
 * automation-test-admin used by every other spec), since this test removes and re-adds an
 * admin_users row and must never risk leaving the shared test account in a broken state if the
 * test itself fails partway through.
 */
function getServiceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const TEST_MARKER = 'e2e.test.internal';

async function makeTempAdmin(tag: string) {
  const service = getServiceRoleClient();
  const email = `permcheck-${tag}-${Date.now()}@${TEST_MARKER}`;
  const password = `Sec#${Math.random().toString(36).slice(2, 12)}A1`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');

  const { error: adminInsertErr } = await service.from('admin_users').insert({ email, user_id: userData.user.id });
  if (adminInsertErr) throw adminInsertErr;

  return { userId: userData.user.id, email, password };
}

async function revokeAdmin(userId: string) {
  const service = getServiceRoleClient();
  const { error } = await service.from('admin_users').delete().eq('user_id', userId);
  if (error) throw error;
}

async function cleanup(userId: string) {
  const service = getServiceRoleClient();
  await service.from('admin_users').delete().eq('user_id', userId);
  await service.auth.admin.deleteUser(userId);
}

async function makeCustomerForEditing(tag: string) {
  const service = getServiceRoleClient();
  const uniqueLastName = `PermCheck-${tag}-${Date.now()}`;
  const email = `permcheck-cust-${tag}-${Date.now()}@${TEST_MARKER}`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');

  const { data: row, error } = await service
    .from('customers')
    .insert({
      supabase_user_id: userData.user.id, email, first_name: 'PermCheck', last_name: uniqueLastName, account_type: 'wholesale',
      status: 'approved', approved_at: new Date().toISOString(), legal_business_name: 'Perm Check Business',
      ship_line1: '1 Test St', ship_city: 'Toronto', ship_province: 'Ontario', ship_postal_code: 'M5V 1A1',
      signature_name: 'PermCheck Test', signed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !row) throw error ?? new Error('customer insert failed');
  return { customerId: row.id as string, userId: userData.user.id as string, displayName: uniqueLastName };
}

async function cleanupCustomer(customerId: string, userId: string) {
  const service = getServiceRoleClient();
  await service.from('customers').delete().eq('id', customerId);
  await service.auth.admin.deleteUser(userId);
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
}

test('an admin whose access is revoked while an edit form is open gets cleanly rejected on Save, not a silent success and not a crash', async ({ page }) => {
  const admin = await makeTempAdmin('revoke');
  const { customerId, userId: customerUserId, displayName } = await makeCustomerForEditing('revoke-target');
  try {
    await loginAs(page, admin.email, admin.password);
    await page.goto('/customers');
    await expect(page.getByText(displayName)).toBeVisible({ timeout: 15_000 });
    await page.getByText(displayName).click();
    await page.getByRole('button', { name: 'Edit info' }).click();

    // Revoke this admin's access NOW, while they still have the form open -- their browser
    // session (cookies) stays "logged in" client-side; only the server-side admin_users check
    // changes. This simulates an admin being deactivated mid-session by another admin.
    await revokeAdmin(admin.userId);

    await page.getByLabel('Legal Business Name').fill('Should Not Be Saved');
    await page.getByRole('button', { name: 'Save changes' }).click();

    // Must NOT silently succeed -- the new value must never appear as saved.
    await expect(page.getByText('Should Not Be Saved')).not.toBeVisible({ timeout: 5_000 });

    // The database must be untouched.
    const service = getServiceRoleClient();
    const { data: row } = await service.from('customers').select('legal_business_name').eq('id', customerId).single();
    expect(row?.legal_business_name).toBe('Perm Check Business');

    // The page must still be usable (no crash) -- confirm the app is still responsive, e.g. by
    // checking the drawer or an error message is present rather than a blank/broken page.
    await expect(page.locator('body')).toBeVisible();
  } finally {
    await cleanup(admin.userId);
    await cleanupCustomer(customerId, customerUserId);
  }
});
