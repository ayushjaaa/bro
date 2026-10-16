import { test, expect, type Page, type Browser } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * TWO REAL browser windows, both logged in as admin, both looking at the SAME customer row.
 * Admin A clicks an action first and wins. Admin B's browser (which loaded the row BEFORE A
 * acted, so it's showing stale data -- no reload in between) then clicks the SAME action a moment
 * later and loses the race for real -- not simulated via RPC, an actual second browser click.
 * Confirms, for every action: (1) Admin B sees the real specific error message, (2) Admin B's page
 * never crashes (no Next.js dev error overlay, page stays usable).
 *
 * Run: npx playwright test e2e/_tmp-dual-browser-race-errors.spec.ts --headed --project=chromium
 */
const ADMIN_EMAIL = 'manual-test-admin-1791913170814@example.com';
const ADMIN_PASSWORD = 'ManualAdmin123!';
const TEST_MARKER = 'e2e.test.internal';

function getServiceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function openAdminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 30_000 });
  return page;
}

// `#nextjs__container_errors_desc` is NOT a reliable crash signal -- it's Next.js dev mode's
// own hidden a11y-mirror node, which stays mounted for the rest of the session the instant ANY
// console.error() fires (including ones we deliberately log and handle), confirmed earlier this
// session by watching it stay present while the page remained fully interactive. The meaningful
// check is simply that the page is still there and usable.
async function assertNoCrash(page: Page) {
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  await expect(page.getByRole('navigation').first()).toBeVisible();
}

async function makeCustomer(tag: string, status: 'pending' | 'approved' | 'deactivated') {
  const service = getServiceRoleClient();
  const email = `dualrace-${tag}-${Date.now()}@${TEST_MARKER}`;
  const { data: userData } = await service.auth.admin.createUser({ email, email_confirm: true });
  const baseStatus = status === 'deactivated' ? 'approved' : status;
  const { data: row } = await service
    .from('customers')
    .insert({
      supabase_user_id: userData!.user!.id, email, first_name: 'DualRace', last_name: tag, account_type: 'wholesale',
      status: baseStatus, ship_line1: '1 Test St', ship_city: 'Toronto', ship_province: 'Ontario', ship_postal_code: 'M5V 1A1',
      signature_name: 'DualRace Test', signed_at: new Date().toISOString(),
      ...(baseStatus === 'approved' ? { approved_at: new Date().toISOString() } : {}),
    })
    .select('id')
    .single();
  if (status === 'deactivated') await service.rpc('deactivate_customer', { p_id: row!.id, p_deactivated_by: 'setup', p_reason: 'setup' });
  return { customerId: row!.id as string, userId: userData!.user!.id, email };
}

async function cleanup(customerId: string, userId: string, email: string) {
  const service = getServiceRoleClient();
  await service.from('customers').delete().eq('id', customerId);
  await service.auth.admin.deleteUser(userId);
  await service.from('suspended_applicants').delete().eq('email', email);
  await service.from('rejection_history').delete().eq('email', email);
}

test('SUSPEND: two real browsers, Admin A wins, Admin B sees the real error and does not crash', async ({ browser }) => {
  test.setTimeout(120_000);
  const { customerId, userId, email } = await makeCustomer('suspend', 'approved');
  try {
    const pageA = await openAdminPage(browser);
    const pageB = await openAdminPage(browser);
    console.log('Admin A and Admin B both logged in, two separate browser windows.');

    await pageA.goto('/customers');
    await pageB.goto('/customers');
    const rowA = pageA.getByTestId(`customer-row-${customerId}`);
    const rowB = pageB.getByTestId(`customer-row-${customerId}`);
    await expect(rowA).toBeVisible({ timeout: 15_000 });
    await expect(rowB).toBeVisible({ timeout: 15_000 });
    console.log('Both browsers looking at the same customer row.');

    // Admin A wins.
    await rowA.getByRole('button', { name: 'Suspend' }).click();
    await pageA.getByPlaceholder(/reason for suspension/i).fill('Admin A won this race');
    pageA.once('dialog', (d) => d.accept());
    await pageA.getByRole('button', { name: 'Permanently suspend' }).click();
    await expect(pageA.getByText(/suspended/i).first()).toBeVisible({ timeout: 10_000 });
    console.log('Admin A: Suspend succeeded.');

    // Admin B's browser never reloaded -- still shows the row as approved, with a live Suspend
    // button. Admin B clicks it now, a real moment after Admin A already won.
    await rowB.getByRole('button', { name: 'Suspend' }).click();
    await pageB.getByPlaceholder(/reason for suspension/i).fill('Admin B is about to lose this race');
    pageB.once('dialog', (d) => d.accept());
    await pageB.getByRole('button', { name: 'Permanently suspend' }).click();

    const drawerB = pageB.getByRole('dialog');
    await expect(drawerB.getByText(/already suspended/i)).toBeVisible({ timeout: 10_000 });
    await assertNoCrash(pageB);
    console.log('Admin B: saw the real "already suspended" message, page did not crash. PASS.');
  } finally {
    await cleanup(customerId, userId, email);
  }
});

test('DEACTIVATE: two real browsers, Admin A suspends first, Admin B tries to Deactivate the same row and loses cleanly', async ({ browser }) => {
  test.setTimeout(120_000);
  const { customerId, userId, email } = await makeCustomer('deactivate', 'approved');
  try {
    const pageA = await openAdminPage(browser);
    const pageB = await openAdminPage(browser);

    await pageA.goto('/customers');
    await pageB.goto('/customers');
    const rowA = pageA.getByTestId(`customer-row-${customerId}`);
    const rowB = pageB.getByTestId(`customer-row-${customerId}`);
    await expect(rowA).toBeVisible({ timeout: 15_000 });
    await expect(rowB).toBeVisible({ timeout: 15_000 });

    await rowA.getByRole('button', { name: 'Suspend' }).click();
    await pageA.getByPlaceholder(/reason for suspension/i).fill('Admin A suspends it first');
    pageA.once('dialog', (d) => d.accept());
    await pageA.getByRole('button', { name: 'Permanently suspend' }).click();
    await expect(pageA.getByText(/suspended/i).first()).toBeVisible({ timeout: 10_000 });
    console.log('Admin A: Suspend succeeded.');

    // Admin B's stale browser still shows it approved -- tries Deactivate.
    await rowB.getByRole('button', { name: 'Deactivate' }).click();
    await pageB.getByPlaceholder(/reason for deactivation/i).fill('Admin B tries to deactivate a now-suspended row');
    pageB.once('dialog', (d) => d.accept());
    await pageB.getByRole('button', { name: 'Deactivate', exact: true }).last().click();

    const drawerB = pageB.getByRole('dialog');
    await expect(drawerB.getByText(/only an approved customer can be deactivated/i)).toBeVisible({ timeout: 10_000 });
    await assertNoCrash(pageB);
    console.log('Admin B: saw the real message, page did not crash. PASS.');
  } finally {
    await cleanup(customerId, userId, email);
  }
});

test('REACTIVATE: two real browsers, Admin A reactivates first, Admin B clicks Reactivate again on the same stale row', async ({ browser }) => {
  test.setTimeout(120_000);
  const { customerId, userId, email } = await makeCustomer('reactivate', 'deactivated');
  try {
    const pageA = await openAdminPage(browser);
    const pageB = await openAdminPage(browser);

    await pageA.goto('/customers');
    await pageB.goto('/customers');
    const rowA = pageA.getByTestId(`customer-row-${customerId}`);
    const rowB = pageB.getByTestId(`customer-row-${customerId}`);
    await expect(rowA).toBeVisible({ timeout: 15_000 });
    await expect(rowB).toBeVisible({ timeout: 15_000 });

    pageA.once('dialog', (d) => d.accept());
    await rowA.getByRole('button', { name: 'Reactivate' }).click();
    await expect(rowA.getByText('approved', { exact: false })).toBeVisible({ timeout: 10_000 });
    console.log('Admin A: Reactivate succeeded.');

    // Admin B's stale browser still shows "Reactivate" -- clicks it on an already-approved row.
    // Diagnostic: Admin B's own page is ALSO realtime-subscribed, so it may have already self-
    // healed to 'approved' by now, removing the Reactivate button before we can click it -- log
    // what's actually there instead of hanging silently for the full test timeout.
    const stillHasButton = await rowB.getByRole('button', { name: 'Reactivate' }).count();
    console.log(`Admin B row: Reactivate button count = ${stillHasButton}, row text = ${await rowB.innerText()}`);
    pageB.once('dialog', (d) => d.accept());
    await rowB.getByRole('button', { name: 'Reactivate' }).click({ timeout: 15_000 });

    await expect(pageB.getByText(/only a deactivated customer can be reactivated/i)).toBeVisible({ timeout: 10_000 });
    await assertNoCrash(pageB);
    console.log('Admin B: saw the real message, page did not crash. PASS.');
  } finally {
    await cleanup(customerId, userId, email);
  }
});

test('ALLOW REAPPLY: two real browsers, Admin A resets first, Admin B clicks Allow reapply on the now-gone row', async ({ browser }) => {
  test.setTimeout(120_000);
  const service = getServiceRoleClient();
  const { customerId, userId, email } = await makeCustomer('reapply', 'pending');
  try {
    await service.rpc('reject_customer', { p_id: customerId, p_rejected_by: 'e2e' });

    const pageA = await openAdminPage(browser);
    const pageB = await openAdminPage(browser);

    await pageA.goto('/customers');
    await pageB.goto('/customers');
    const rowA = pageA.getByTestId(`customer-row-${customerId}`);
    const rowB = pageB.getByTestId(`customer-row-${customerId}`);
    await expect(rowA).toBeVisible({ timeout: 15_000 });
    await expect(rowB).toBeVisible({ timeout: 15_000 });

    pageA.once('dialog', (d) => d.accept());
    await rowA.getByRole('button', { name: 'Allow reapply' }).click();
    await expect(pageA.getByTestId(`customer-row-${customerId}`)).not.toBeVisible({ timeout: 10_000 });
    console.log('Admin A: Allow reapply succeeded, row deleted.');

    // Admin B's stale browser still shows the row with its "Allow reapply" button -- clicks it on
    // a row that no longer exists. Two dialogs now: the confirm(), then a guaranteed alert()
    // surfacing the real error (added because this action deletes its own row, so the inline
    // rowError paragraph can vanish along with the row before anyone reads it).
    let alertMessage = '';
    let dialogCount = 0;
    pageB.on('dialog', (d) => {
      dialogCount += 1;
      if (dialogCount === 2) alertMessage = d.message();
      void d.accept();
    });
    await rowB.getByRole('button', { name: 'Allow reapply' }).click();

    await expect.poll(() => alertMessage, { timeout: 10_000 }).toMatch(/only a rejected application can be reset/i);
    await assertNoCrash(pageB);
    console.log('Admin B: saw the real message, page did not crash. PASS.');
  } finally {
    await service.auth.admin.deleteUser(userId);
    await service.from('rejection_history').delete().eq('email', email);
  }
});
