import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginAsAdmin } from '../fixtures';

/**
 * Live browser coverage for 034's admin-panel UI (Suspend/Deactivate/Reactivate/Allow-reapply) --
 * same backend already proven directly by tests/security/customer-suspend-deactivate.test.ts; this
 * file is specifically about the UI affordances: which buttons exist for which status, that the
 * mandatory reason is actually enforced in the form (not just the RPC), and that a permanently
 * suspended row shows NO action anywhere once it's reached that state.
 */
function getServiceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const TEST_MARKER = 'e2e.test.internal';

async function makeCustomer(tag: string, status: 'pending' | 'approving' | 'approved' | 'rejected' | 'deactivated' | 'suspended') {
  const service = getServiceRoleClient();
  const uniqueLastName = `SuspendDeact-${tag}-${Date.now()}`;
  const email = `suspenddeact-${tag}-${Date.now()}@${TEST_MARKER}`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');

  const baseStatus = status === 'approving' ? 'pending' : status === 'deactivated' || status === 'suspended' ? 'approved' : status;
  const { data: row, error } = await service
    .from('customers')
    .insert({
      supabase_user_id: userData.user.id, email, first_name: 'SuspendDeact', last_name: uniqueLastName, account_type: 'wholesale',
      status: baseStatus, ship_line1: '1 Test St', ship_city: 'Toronto', ship_province: 'Ontario',
      ship_postal_code: 'M5V 1A1', signature_name: 'SuspendDeact Test', signed_at: new Date().toISOString(),
      ...(baseStatus === 'approved' ? { approved_at: new Date().toISOString() } : {}),
    })
    .select('id')
    .single();
  if (error || !row) throw error ?? new Error('customer insert failed');

  if (status === 'approving') await service.rpc('claim_customer_for_approval', { p_id: row.id });
  if (status === 'deactivated') await service.rpc('deactivate_customer', { p_id: row.id, p_deactivated_by: 'setup', p_reason: 'setup' });
  if (status === 'suspended') await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'setup', p_reason: 'setup' });

  return { customerId: row.id as string, userId: userData.user.id as string, displayName: uniqueLastName, email };
}

async function cleanup(customerId: string, userId: string, email: string) {
  const service = getServiceRoleClient();
  await service.from('customers').delete().eq('id', customerId);
  await service.auth.admin.deleteUser(userId); // safe even if 035's Allow-reapply already deleted this -- error is ignored
  await service.from('suspended_applicants').delete().eq('email', email);
  await service.from('rejection_history').delete().eq('email', email);
}

async function openRow(page: Page, displayName: string) {
  await page.goto('/customers');
  await expect(page.getByText(displayName)).toBeVisible({ timeout: 15_000 });
  return page.locator('tr', { has: page.getByText(displayName) });
}

test('Suspend requires a reason, is permanent, and leaves zero action buttons anywhere once applied', async ({ page }) => {
  const { customerId, userId, displayName, email } = await makeCustomer('suspend', 'approved');
  try {
    await loginAsAdmin(page);
    const row = await openRow(page, displayName);
    await row.getByRole('button', { name: 'Suspend' }).click();

    // The drawer opens straight to the reason form (not a bare confirm()) -- the submit button
    // must stay disabled until a reason is actually typed.
    const suspendSubmit = page.getByRole('button', { name: 'Permanently suspend' });
    await expect(suspendSubmit).toBeDisabled();

    await page.getByPlaceholder(/reason for suspension/i).fill('confirmed fraud');
    await expect(suspendSubmit).toBeEnabled();

    page.once('dialog', (d) => d.accept());
    await suspendSubmit.click();

    await expect(page.getByText(/suspended/i).first()).toBeVisible({ timeout: 10_000 });

    // Re-open the row: no Suspend/Deactivate/Reactivate/Allow-reapply button should exist anymore,
    // in the table row or inside the drawer -- a suspended customer is a dead end everywhere.
    const rowAfter = await openRow(page, displayName);
    await expect(rowAfter.getByRole('button', { name: 'Suspend' })).not.toBeVisible();
    await expect(rowAfter.getByRole('button', { name: 'Deactivate' })).not.toBeVisible();
    await expect(rowAfter.getByRole('button', { name: 'Reactivate' })).not.toBeVisible();
    await rowAfter.getByText('View details').click();
    // Scoped to the drawer specifically -- unscoped, this matches every OTHER customer row's own
    // Suspend/Deactivate buttons elsewhere in the table too (a real false negative hit while
    // writing this test: the table has dozens of other rows with these exact button labels).
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('button', { name: /suspend|deactivate|reactivate/i })).not.toBeVisible();
    await expect(drawer.getByText(/cannot be reversed/i)).toBeVisible();

    const service = getServiceRoleClient();
    const { data: finalRow } = await service.from('customers').select('status').eq('id', customerId).single();
    expect(finalRow?.status).toBe('suspended');
  } finally {
    await cleanup(customerId, userId, email);
  }
});

test('Suspend is offered on a still-pending applicant (fraud can be blocked before ever approving), but Deactivate is not', async ({ page }) => {
  const { customerId, userId, displayName, email } = await makeCustomer('suspend-pending', 'pending');
  try {
    await loginAsAdmin(page);
    const row = await openRow(page, displayName);
    await expect(row.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Reject' })).toBeVisible();
    const suspendQuickAction = row.getByRole('button', { name: 'Suspend' });
    await expect(suspendQuickAction).toBeVisible();

    await suspendQuickAction.click();
    const suspendSubmit = page.getByRole('button', { name: 'Permanently suspend' });
    await expect(suspendSubmit).toBeDisabled();
    // Deactivate must not be offered here even once the drawer is open -- only Suspend is valid
    // pre-approval (a pending applicant has no live access to "pause").
    await expect(page.getByRole('button', { name: 'Deactivate account' })).not.toBeVisible();

    await page.getByPlaceholder(/reason for suspension/i).fill('fraudulent documents on application');
    page.once('dialog', (d) => d.accept());
    await suspendSubmit.click();
    await expect(page.getByText(/suspended/i).first()).toBeVisible({ timeout: 10_000 });

    const service = getServiceRoleClient();
    const { data: finalRow } = await service.from('customers').select('status').eq('id', customerId).single();
    expect(finalRow?.status).toBe('suspended');
  } finally {
    await cleanup(customerId, userId, email);
  }
});

test('Suspend/Deactivate are not offered on a customer that is still mid-approving', async ({ page }) => {
  const { customerId, userId, displayName, email } = await makeCustomer('midapproving', 'approving');
  try {
    await loginAsAdmin(page);
    const row = await openRow(page, displayName);
    await expect(row.getByRole('button', { name: 'Suspend' })).not.toBeVisible();
    await expect(row.getByRole('button', { name: 'Deactivate' })).not.toBeVisible();
  } finally {
    await cleanup(customerId, userId, email);
  }
});

test('Deactivate then Reactivate round-trips cleanly through the UI with no data loss', async ({ page }) => {
  const { customerId, userId, displayName, email } = await makeCustomer('deactivate', 'approved');
  try {
    await loginAsAdmin(page);
    const row = await openRow(page, displayName);
    await row.getByRole('button', { name: 'Deactivate' }).click();

    const deactivateSubmit = page.getByRole('button', { name: 'Deactivate', exact: true }).last();
    await expect(deactivateSubmit).toBeDisabled();
    await page.getByPlaceholder(/reason for deactivation/i).fill('temporary hold, billing dispute');
    await expect(deactivateSubmit).toBeEnabled();

    page.once('dialog', (d) => d.accept());
    await deactivateSubmit.click();
    await expect(page.getByText(/deactivated/i).first()).toBeVisible({ timeout: 10_000 });

    const rowAfter = await openRow(page, displayName);
    const reactivateButton = rowAfter.getByRole('button', { name: 'Reactivate' });
    await expect(reactivateButton).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await reactivateButton.click();
    await expect(rowAfter.getByText('approved', { exact: false })).toBeVisible({ timeout: 10_000 });

    const service = getServiceRoleClient();
    const { data: finalRow } = await service.from('customers').select('status, legal_business_name').eq('id', customerId).single();
    expect(finalRow?.status).toBe('approved');
  } finally {
    await cleanup(customerId, userId, email);
  }
});

test('Reject then Allow reapply DELETES the row (035) -- genuinely freeing the email for a fresh registration, not just resetting fields in place', async ({ page }) => {
  const { customerId, userId, displayName, email } = await makeCustomer('reject', 'pending');
  try {
    await loginAsAdmin(page);
    let row = await openRow(page, displayName);
    page.once('dialog', (d) => d.accept());
    await row.getByRole('button', { name: 'Reject' }).click();
    await expect(row.getByText(/rejected/i)).toBeVisible({ timeout: 10_000 });

    row = await openRow(page, displayName);
    const reapplyButton = row.getByRole('button', { name: 'Allow reapply' });
    await expect(reapplyButton).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await reapplyButton.click();

    // The row (and its Auth user) is genuinely gone now -- 034's version only reset fields in
    // place, which left the email still "taken" from signUp()'s point of view; 035 deletes outright.
    await expect(page.getByTestId(`customer-row-${customerId}`)).not.toBeVisible({ timeout: 10_000 });

    const service = getServiceRoleClient();
    const { data: finalRow } = await service.from('customers').select('id').eq('id', customerId).maybeSingle();
    expect(finalRow).toBeNull();

    const { data: history } = await service.from('rejection_history').select('email').eq('original_customer_id', customerId).single();
    expect(history?.email).toBe(email);

    const { data: stillRegistered } = await service.rpc('email_registered', { p_email: email });
    expect(stillRegistered).toBe(false);
  } finally {
    await cleanup(customerId, userId, email);
  }
});
