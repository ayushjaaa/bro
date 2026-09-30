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
});
