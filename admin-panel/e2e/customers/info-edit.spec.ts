import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginAsAdmin } from '../fixtures';

/**
 * Live browser coverage for Part 2 of the approval-race-guards plan: an admin editing a
 * customer's application info under optimistic locking (031 migration). Basic save comes first
 * (the more fundamental path -- if this silently breaks, the conflict test below would still
 * pass while the actual feature doesn't work), then the conflict-resolution flow.
 */
function getServiceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const TEST_MARKER = 'e2e.test.internal';

async function makeApprovedTestCustomer(tag: string) {
  const service = getServiceRoleClient();
  const uniqueLastName = `InfoEdit-${tag}-${Date.now()}`;
  const email = `infoedit-${tag}-${Date.now()}@${TEST_MARKER}`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');

  const { data: row, error } = await service
    .from('customers')
    .insert({
      supabase_user_id: userData.user.id, email, first_name: 'InfoEdit', last_name: uniqueLastName, account_type: 'wholesale',
      status: 'approved', approved_at: new Date().toISOString(), legal_business_name: 'Original Business Name',
      ship_line1: '1 Test St', ship_city: 'Toronto', ship_province: 'Ontario', ship_postal_code: 'M5V 1A1',
      signature_name: 'InfoEdit Test', signed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !row) throw error ?? new Error('customer insert failed');
  return { customerId: row.id as string, userId: userData.user.id as string, displayName: uniqueLastName };
}

async function cleanup(customerId: string, userId: string) {
  const service = getServiceRoleClient();
  await service.from('customers').delete().eq('id', customerId);
  await service.auth.admin.deleteUser(userId);
}

async function openCustomerDrawer(page: Page, displayName: string) {
  await loginAsAdmin(page);
  await page.goto('/customers');
  await page.getByText(displayName).click();
}

test.describe('Customer info editing (Part 2)', () => {
  test('frontend validation blocks an invalid value BEFORE it reaches the server -- clearing a required field shows an error instantly, nothing is saved', async ({ page }) => {
    const { customerId, userId, displayName } = await makeApprovedTestCustomer('frontend-validation');
    try {
      await openCustomerDrawer(page, displayName);
      await page.getByRole('button', { name: 'Edit info' }).click();

      // Legal Business Name is required-if-touched -- clear it, then try to save.
      await page.getByLabel('Legal Business Name').fill('');
      await page.getByRole('button', { name: 'Save changes' }).click();

      // The same validation message the backend would give, shown immediately -- the edit form
      // must still be open (a real server round trip was never needed to catch this).
      await expect(page.getByText(/cannot be empty/i)).toBeVisible({ timeout: 2_000 });
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();

      // Confirm nothing reached the database at all.
      const service = getServiceRoleClient();
      const { data: row } = await service.from('customers').select('legal_business_name').eq('id', customerId).single();
      expect(row?.legal_business_name).toBe('Original Business Name');
    } finally {
      await cleanup(customerId, userId);
    }
  });

  test('frontend validation catches a malformed postal code before saving', async ({ page }) => {
    const { customerId, userId, displayName } = await makeApprovedTestCustomer('frontend-validation-postal');
    try {
      await openCustomerDrawer(page, displayName);
      await page.getByRole('button', { name: 'Edit info' }).click();

      await page.getByLabel('Shipping Postal Code').fill('not-a-real-code');
      await page.getByRole('button', { name: 'Save changes' }).click();

      await expect(page.getByText(/valid.*postal code/i)).toBeVisible({ timeout: 2_000 });
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
    } finally {
      await cleanup(customerId, userId);
    }
  });

  test('a normal edit, with no conflict, saves and shows the new value', async ({ page }) => {
    const { customerId, userId, displayName } = await makeApprovedTestCustomer('basic');
    try {
      await openCustomerDrawer(page, displayName);
      await expect(page.getByText('Original Business Name')).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: 'Edit info' }).click();
      const field = page.getByLabel('Legal Business Name');
      await field.fill('Updated Business Name');
      await page.getByRole('button', { name: 'Save changes' }).click();

      // Editing mode closes and the read-only card shows the new value -- proves the save
      // actually reached the RPC and the row re-rendered with it, not just that the form closed.
      await expect(page.getByText('Updated Business Name')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: 'Save changes' })).not.toBeVisible();
    } finally {
      await cleanup(customerId, userId);
    }
  });

  test('a stale-version save shows the conflict banner and does not silently overwrite the other change', async ({ page }) => {
    const { customerId, userId, displayName } = await makeApprovedTestCustomer('conflict');
    try {
      await openCustomerDrawer(page, displayName);
      await page.getByRole('button', { name: 'Edit info' }).click();

      // The form has already captured its version at this point (page load). Now simulate
      // another admin saving a change in between -- directly via the service-role client, the
      // same effect as a second browser tab saving first.
      const service = getServiceRoleClient();
      const { error } = await service.rpc('update_customer_application_info', {
        p_id: customerId,
        p_version: 1,
        p_fields: { legalBusinessName: 'Changed By Someone Else' },
      });
      expect(error).toBeNull();

      // This admin edits a DIFFERENT field and saves -- their own edit, made before they knew
      // about the other change.
      await page.getByLabel('Operating Name').fill('My New Operating Name');
      await page.getByRole('button', { name: 'Save changes' }).click();

      // Conflict banner appears, explaining someone else changed the record.
      await expect(page.getByText(/updated by someone else/i)).toBeVisible({ timeout: 10_000 });

      // This admin's own in-progress edit must still be sitting in the form -- not discarded.
      await expect(page.getByLabel('Operating Name')).toHaveValue('My New Operating Name');

      // Confirm the database was NOT silently overwritten by the first (failed) save attempt --
      // the other admin's change survived.
      const { data: row } = await service.from('customers').select('legal_business_name, operating_name').eq('id', customerId).single();
      expect(row?.legal_business_name).toBe('Changed By Someone Else');
      expect(row?.operating_name).not.toBe('My New Operating Name');

      // Now resolve the conflict the way the UI offers -- save on top of the latest version.
      await page.getByRole('button', { name: /save my changes on top of the latest version/i }).click();
      await expect(page.getByText('My New Operating Name')).toBeVisible({ timeout: 10_000 });

      // The other admin's change (a field this admin never touched) must survive the resolution
      // too -- not get silently reverted just because it was present in this admin's form with
      // its OLD value (the bug the two-tab test below found and this now guards against).
      const { data: finalRow } = await service.from('customers').select('legal_business_name, operating_name').eq('id', customerId).single();
      expect(finalRow?.operating_name).toBe('My New Operating Name');
      expect(finalRow?.legal_business_name).toBe('Changed By Someone Else');
    } finally {
      await cleanup(customerId, userId);
    }
  });

  // Two REAL browser tabs (contexts), both with the edit form open on the same customer -- the
  // realistic version of the conflict test above (which simulated the other admin via a direct
  // service-role call instead of a second tab). Also a regression guard for the frozen-version
  // bug found running the full suite (CustomerDrawer.tsx's Save button was reading the live,
  // Realtime-synced `customer` prop instead of a snapshot frozen when editing started, which
  // silently defeated the conflict check) -- two genuinely separate tabs, with real time passing
  // and a real Realtime update crossing between them, exercise that exact path.
  //
  // Save clicks are sequenced (A fully completes, then B), not fired truly simultaneously via
  // Promise.all -- tried that first and found Next.js's dev server doesn't reliably handle two
  // genuinely concurrent Server Action invocations from two different sessions (confirmed via a
  // diagnostic: both saves silently no-op'd, version never moved off 1 -- the same class of dev-
  // server-concurrency artifact found and documented in approve-race.spec.ts, not a real app bug;
  // the backend test file already proves true Promise.all concurrency at the RPC layer directly).
  // Sequencing still fully tests what matters for THIS test -- does tab B's conflict check survive
  // real elapsed time and a real cross-tab Realtime update, using its own frozen version.
  test('two open tabs editing the same customer -- tab B, still on its original version, gets the conflict banner after tab A saves first', async ({ browser }) => {
    // Longer than the default 30s -- this test does two logins, two form-opens, and two saves
    // with assertions in between; with slowMo enabled for a visible headed run, the cumulative
    // per-action delay alone can exceed the default budget even though nothing is actually stuck.
    test.setTimeout(150_000);
    const { customerId, userId, displayName } = await makeApprovedTestCustomer('twotab');
    try {
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await openCustomerDrawer(pageA, displayName);
      await openCustomerDrawer(pageB, displayName);

      await pageA.getByRole('button', { name: 'Edit info' }).click();
      await pageB.getByRole('button', { name: 'Edit info' }).click();

      // Tab B fills in its edit now -- before tab A saves -- so its frozen version is captured
      // while the row is still unmodified, same as a real admin who started editing first.
      await pageB.getByLabel('Operating Name').fill('Name From Tab B');

      // Tab A saves and fully completes first.
      await pageA.getByLabel('Legal Business Name').fill('Name From Tab A');
      await pageA.getByRole('button', { name: 'Save changes' }).click();
      await expect(pageA.getByText('Name From Tab A')).toBeVisible({ timeout: 10_000 });

      // Give tab B's Realtime subscription a moment to receive tab A's change (proving the
      // frozen-version fix: even though B's `customer` prop has now updated in the background,
      // B's Save must still use the version it started with, not the just-arrived new one).
      await pageB.waitForTimeout(1500);

      await pageB.getByRole('button', { name: 'Save changes' }).click();
      await expect(pageB.getByText(/updated by someone else/i)).toBeVisible({ timeout: 10_000 });
      await expect(pageB.getByLabel('Operating Name')).toHaveValue('Name From Tab B');

      const service = getServiceRoleClient();
      const { data: row } = await service.from('customers').select('legal_business_name, operating_name').eq('id', customerId).single();
      expect(row?.legal_business_name).toBe('Name From Tab A');
      expect(row?.operating_name).not.toBe('Name From Tab B');

      // Resolve the conflict the way the UI offers -- both admins' work ends up saved.
      await pageB.getByRole('button', { name: /save my changes on top of the latest version/i }).click();
      await expect(pageB.getByText('Name From Tab B')).toBeVisible({ timeout: 10_000 });

      const { data: finalRow } = await service.from('customers').select('legal_business_name, operating_name').eq('id', customerId).single();
      expect(finalRow?.legal_business_name).toBe('Name From Tab A');
      expect(finalRow?.operating_name).toBe('Name From Tab B');

      await contextA.close();
      await contextB.close();
    } finally {
      await cleanup(customerId, userId);
    }
  });
});
