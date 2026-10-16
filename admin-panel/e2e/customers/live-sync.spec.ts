import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginAsAdmin } from '../fixtures';

/**
 * Live browser coverage for Part 3 of the approval-race-guards plan: the admin Customers list
 * should update live across open sessions without a manual reload.
 *
 * Cross-tab sync uses two independent browser CONTEXTS, not two tabs in one context -- each gets
 * its own cookies/session, closer to two different admins than two tabs sharing one login. This
 * is also what caught a real bug during development: a Realtime payload's raw snake_case columns
 * were being applied directly as if already camelCase-shaped, silently blanking every other field
 * after the first live update (fixed in useLiveTable.ts / customer-row-mapper.ts).
 *
 * The "backgrounded tab / connection break" reconnect-resync scenario is intentionally NOT
 * covered here as a live network-drop e2e test -- tried it first (`context.setOffline()`) and
 * confirmed via a throwaway diagnostic that it doesn't reliably sever an already-established
 * WebSocket in this environment (15s+ offline produced zero heartbeat/reconnect activity from the
 * Supabase client), making that approach flaky and slow for no real confidence gain. That
 * scenario's actual decision logic (shouldAttemptReconnect / shouldResyncOnSubscribe /
 * applyRealtimePayload) is unit-tested deterministically instead --
 * tests/unit/use-live-table-logic.test.ts.
 */
function getServiceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const TEST_MARKER = 'e2e.test.internal';

async function makePendingTestCustomer(tag: string) {
  const service = getServiceRoleClient();
  // The Customers table renders "firstName lastName", never the email -- lastName carries the
  // unique marker so tests can find their own row reliably (see CustomerTableRow's Name column).
  const uniqueLastName = `LiveSync-${tag}-${Date.now()}`;
  const email = `livesync-${tag}-${Date.now()}@${TEST_MARKER}`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');

  const { data: row, error } = await service
    .from('customers')
    .insert({
      supabase_user_id: userData.user.id, email, first_name: 'LiveSync', last_name: uniqueLastName, account_type: 'wholesale',
      status: 'pending', ship_line1: '1 Test St', ship_city: 'Toronto', ship_province: 'Ontario',
      ship_postal_code: 'M5V 1A1', signature_name: 'LiveSync Test', signed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !row) throw error ?? new Error('customer insert failed');
  return { customerId: row.id as string, userId: userData.user.id as string, displayName: uniqueLastName };
}

/** Inserted already 'approved' (bypassing the real approval workflow) -- used by tests that only
 * care about Realtime sync for an already-approved row (suspend/deactivate, By Sales Rep
 * membership), where going through claim/Shopify/finalize would just be unrelated setup cost. */
async function makeApprovedTestCustomer(tag: string) {
  const service = getServiceRoleClient();
  const uniqueLastName = `LiveSync-${tag}-${Date.now()}`;
  const email = `livesync-${tag}-${Date.now()}@${TEST_MARKER}`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');

  const { data: row, error } = await service
    .from('customers')
    .insert({
      supabase_user_id: userData.user.id, email, first_name: 'LiveSync', last_name: uniqueLastName, account_type: 'wholesale',
      status: 'approved', ship_line1: '1 Test St', ship_city: 'Toronto', ship_province: 'Ontario',
      ship_postal_code: 'M5V 1A1', signature_name: 'LiveSync Test', signed_at: new Date().toISOString(),
      approved_at: new Date().toISOString(), approved_by: 'e2e-setup',
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

async function openCustomersList(page: Page) {
  await loginAsAdmin(page);
  await page.goto('/customers');
}

// Uses Reject, not Approve, as the triggering action -- Approve calls the real Shopify Admin API
// (findOrCreateShopifyCustomer), which this local/CI test environment isn't guaranteed to have
// working credentials for. Reject never touches Shopify (030 migration: `reject_customer` is a
// pure DB guard), so it isolates what these tests actually care about -- the Realtime sync
// mechanism -- from an unrelated external dependency. Part 1's own tests (customer-approval-
// races.test.ts) already cover the Shopify-call path directly against the RPCs.
test.describe('Customers list live sync (Part 3)', () => {
  test('rejecting a customer in one session is reflected in another open session without a manual reload', async ({ browser }) => {
    // Two full page loads + a dialog-confirmed click routinely land right at/over the default
    // 30s ceiling in this environment as test data accumulates across a session (same root cause
    // diagnosed earlier: not a correctness issue) -- same test.slow() reasoning as the other
    // multi-navigation tests in this file.
    test.slow();
    const { customerId, userId, displayName } = await makePendingTestCustomer('crosstab');
    try {
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await openCustomersList(pageA);
      await openCustomersList(pageB);

      // Both sessions should see the freshly-seeded pending customer.
      await expect(pageA.getByText(displayName)).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByText(displayName)).toBeVisible({ timeout: 15_000 });

      // Reject from session A.
      const rowA = pageA.locator('tr', { has: pageA.getByText(displayName) });
      pageA.once('dialog', (d) => d.accept());
      await rowA.getByRole('button', { name: 'Reject' }).click();

      // Session B never reloads or re-navigates -- if the status badge updates anyway, that's
      // the Realtime subscription doing its job, not a stale server-rendered snapshot.
      const rowB = pageB.locator('tr', { has: pageB.getByText(displayName) });
      await expect(rowB.getByText('rejected', { exact: false })).toBeVisible({ timeout: 15_000 });

      await contextA.close();
      await contextB.close();
    } finally {
      await cleanup(customerId, userId);
    }
  });

  // UPDATE (the test above) is the common case, but it's a different code path from INSERT/DELETE
  // in CustomersTable.tsx's realtime handler (a single-row patch vs. a debounced full-page
  // refetch) -- each needs its own live, cross-session proof, not just the UPDATE one.
  test('a brand-new registration (INSERT) appears in an already-open session without a manual reload', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    let customerId: string | undefined;
    let userId: string | undefined;
    try {
      await openCustomersList(pageA);

      // The row is created AFTER session A is already sitting on /customers -- this is the
      // INSERT path specifically, not the already-covered "both sessions load after the row
      // exists" case.
      const created = await makePendingTestCustomer('insert');
      customerId = created.customerId;
      userId = created.userId;

      await expect(pageA.getByText(created.displayName)).toBeVisible({ timeout: 15_000 });
      await contextA.close();
    } finally {
      if (customerId && userId) await cleanup(customerId, userId);
    }
  });

  test('a deleted row (Allow reapply, DELETE) disappears from an already-open session without a manual reload', async ({
    browser,
  }) => {
    // Two full page loads + a dialog-confirmed click, on top of this harness's own slowMo --
    // consistently right at/over the default 30s ceiling in this environment (same root cause as
    // the earlier live-sync timing diagnosis this session: not a correctness issue). test.slow()
    // triples Playwright's default timeout, same as the other multi-navigation tests here.
    test.slow();
    const service = getServiceRoleClient();
    const uniqueLastName = `LiveSync-delete-${Date.now()}`;
    const email = `livesync-delete-${Date.now()}@${TEST_MARKER}`;
    const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, email_confirm: true });
    if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');
    const { data: row, error } = await service
      .from('customers')
      .insert({
        supabase_user_id: userData.user.id, email, first_name: 'LiveSync', last_name: uniqueLastName, account_type: 'wholesale',
        status: 'rejected', ship_line1: '1 Test St', ship_city: 'Toronto', ship_province: 'Ontario',
        ship_postal_code: 'M5V 1A1', signature_name: 'LiveSync Test', signed_at: new Date().toISOString(),
        rejected_at: new Date().toISOString(), rejected_by: 'e2e-setup',
      })
      .select('id')
      .single();
    if (error || !row) throw error ?? new Error('customer insert failed');
    const customerId = row.id as string;

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await openCustomersList(pageA);
      await openCustomersList(pageB);
      await expect(pageA.getByText(uniqueLastName)).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByText(uniqueLastName)).toBeVisible({ timeout: 15_000 });

      const rowA = pageA.locator('tr', { has: pageA.getByText(uniqueLastName) });
      pageA.once('dialog', (d) => d.accept());
      await rowA.getByRole('button', { name: 'Allow reapply' }).click();

      // reset_rejected_customer_for_reapply DELETES the row (035) -- session B should see it
      // vanish entirely, not just change status, with no reload.
      await expect(pageB.getByText(uniqueLastName)).not.toBeVisible({ timeout: 15_000 });

      await contextA.close();
      await contextB.close();
    } finally {
      // The row is gone already if Allow reapply succeeded -- only the auth user needs cleanup
      // (deleteUser on an already-gone id is a harmless no-op either way).
      await service.auth.admin.deleteUser(userData.user.id);
      await service.from('customers').delete().eq('id', customerId);
    }
  });

  // Regression coverage for a real gap found while reviewing the zero-round-trip UPDATE patch:
  // approvedForRepView only ever holds 'approved' rows, so a plain field-patch on a row already
  // in that list would leave a customer that just left 'approved' (e.g. got suspended) stuck
  // showing under its rep/Unassigned bucket forever, with no reload able to fix it short of
  // reopening the tab. patchRowInPlace (CustomersTable.tsx) must re-evaluate MEMBERSHIP in that
  // list on every patch, not just update fields of rows already in it.
  test('suspending an approved customer removes them from an already-open "By Sales Rep" tab without a manual reload', async ({
    browser,
  }) => {
    // Same timing margin reasoning as the DELETE test above -- two sessions, a tab switch, a
    // reason form, and a confirm dialog leave little headroom under the default 30s ceiling here.
    test.slow();
    const { customerId, userId, displayName } = await makeApprovedTestCustomer('byrep-suspend');
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await openCustomersList(pageA);
      await openCustomersList(pageB);

      // Session B switches to "By Sales Rep" -> "Unassigned" (no rep assigned) and confirms the
      // customer is there BEFORE the suspend, so the later disappearance is meaningful.
      await pageB.getByRole('button', { name: 'By Sales Rep' }).click();
      await pageB.getByRole('button', { name: /unassigned/i }).click();
      // .first() -- the email also contains displayName's lastName as a substring (see
      // makeApprovedTestCustomer's email construction), so a bare getByText matches both the
      // name and email paragraphs in the account-list row.
      await expect(pageB.getByText(displayName).first()).toBeVisible({ timeout: 15_000 });

      // Suspend from session A's main table (still on "All Customers").
      const rowA = pageA.locator('tr', { has: pageA.getByText(displayName).first() });
      await rowA.getByRole('button', { name: 'Suspend' }).click();
      await pageA.getByPlaceholder(/reason for suspension/i).fill('e2e: by-rep live removal check');
      pageA.once('dialog', (d) => d.accept());
      await pageA.getByRole('button', { name: 'Permanently suspend' }).click();

      // Session B never left the "By Sales Rep" -> "Unassigned" view and never reloaded -- the
      // customer should disappear from it live, proving membership (not just fields) is re-checked.
      await expect(pageB.getByText(displayName).first()).not.toBeVisible({ timeout: 15_000 });

      await contextA.close();
      await contextB.close();
    } finally {
      await cleanup(customerId, userId);
    }
  });
});
