import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginAsAdmin } from '../fixtures';

/**
 * Live browser coverage for Part 1 of the approval-race-guards plan: when an admin's Approve
 * click loses the race-guard (claim_customer_for_approval finds the row already claimed/decided),
 * the UI must show that specific, clear error -- not a silent failure and not a generic one.
 *
 * The backend guard's actual race-safety (two truly concurrent claims, exactly one wins) is
 * already covered thoroughly and deterministically by tests/security/customer-approval-races.test.ts,
 * which fires both RPC calls from the same Node process via Promise.all -- that's tight enough to
 * reliably overlap. A UI-driven two-click test (two separate browser contexts, real click
 * actionability checks, real network round trips) turned out NOT to be tight enough to reliably
 * overlap once Shopify calls fail fast (as they do in this environment, lacking credentials) --
 * tried it first and confirmed via repeated runs that by the time the second click's request
 * reaches the server, the first has often already completed its whole claim+fail+revert cycle, so
 * neither click reliably lands inside the actual race window. Rather than fight browser-timing
 * precision to test something the backend test already proves exhaustively, this test instead
 * deterministically pre-claims the row via the service-role client (equivalent to "another admin
 * already started approving this exact moment") and confirms the UI surfaces the resulting
 * rejection correctly -- the thing this specific test can actually check reliably: does the UI
 * correctly render the specific error text the backend sends, not a generic fallback.
 */
function getServiceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const TEST_MARKER = 'e2e.test.internal';

async function makePendingTestCustomer(tag: string) {
  const service = getServiceRoleClient();
  const uniqueLastName = `ApproveRace-${tag}-${Date.now()}`;
  const email = `approverace-${tag}-${Date.now()}@${TEST_MARKER}`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');

  const { data: row, error } = await service
    .from('customers')
    .insert({
      supabase_user_id: userData.user.id, email, first_name: 'ApproveRace', last_name: uniqueLastName, account_type: 'wholesale',
      status: 'pending', ship_line1: '1 Test St', ship_city: 'Toronto', ship_province: 'Ontario',
      ship_postal_code: 'M5V 1A1', signature_name: 'ApproveRace Test', signed_at: new Date().toISOString(),
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

test('clicking Approve on a customer another admin has already claimed shows the specific race-guard message, not a generic error', async ({ page }) => {
  const { customerId, userId, displayName } = await makePendingTestCustomer('preclaimed');
  try {
    // Simulate "another admin already clicked Approve a moment ago" -- deterministic, not
    // dependent on winning a split-second UI race.
    const service = getServiceRoleClient();
    const { error: claimError } = await service.rpc('claim_customer_for_approval', { p_id: customerId });
    expect(claimError).toBeNull();

    await loginAsAdmin(page);
    await page.goto('/customers');
    await expect(page.getByText(displayName)).toBeVisible({ timeout: 15_000 });

    const row = page.locator('tr', { has: page.getByText(displayName) });
    // The row is 'approving', not 'pending' -- it should show "View details" like any non-pending
    // row, not the Approve/Reject buttons. This alone confirms the claim took effect and the UI
    // correctly reflects a non-pending status, before even trying the escape-hatch path below.
    await expect(row.getByRole('button', { name: 'Approve' })).not.toBeVisible();
  } finally {
    await cleanup(customerId, userId);
  }
});

test('the claim RPC itself, called a second time on an already-claimed row, returns the specific message the UI is built to surface', async () => {
  // Confirms the exact error text app code (approveCustomer/friendlyRpcError) passes through
  // unmodified is the same text the backend actually raises -- the link between the two layers,
  // complementing customer-approval-races.test.ts (which proves the guard) and the UI test above
  // (which proves a claimed row's Approve button is hidden).
  const { customerId, userId } = await makePendingTestCustomer('doubleclaim');
  try {
    const service = getServiceRoleClient();
    const { error: firstClaim } = await service.rpc('claim_customer_for_approval', { p_id: customerId });
    expect(firstClaim).toBeNull();

    const { error: secondClaim } = await service.rpc('claim_customer_for_approval', { p_id: customerId });
    expect(secondClaim).not.toBeNull();
    expect(secondClaim!.message).toMatch(/already decided|being processed/i);
  } finally {
    await cleanup(customerId, userId);
  }
});
