/**
 * Live database tests for 030-approval-race-guards.sql -- proves the guards themselves are
 * race-free, not just that the JS layer happens to call them in the right order. Run:
 * `npm run test:security` (requires 030-approval-race-guards.sql to have been run against the
 * live project first -- these tests fail with "function does not exist" otherwise, not a
 * meaningful failure of the guards).
 *
 * Uses the service-role client directly (these RPCs are service_role-only by design -- see
 * admin-data-boundary.test.ts for the tests proving non-service-role callers are refused).
 * Concurrent-admin scenarios are simulated by calling the RPC twice in immediate succession
 * (Promise.all) on the same row -- Postgres's own row-locking (see 030's header comment/the plan
 * doc) makes this equivalent to two genuinely simultaneous requests: the second one waits for the
 * first to commit, then re-evaluates its WHERE clause against the now-current row.
 */
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();

const createdCustomerIds: string[] = [];
const createdUserIds: string[] = [];

async function makePendingCustomer(tag: string, accountType: 'wholesale' | 'retail' = 'wholesale') {
  const email = `race-${tag}-${stamp}@e2e.test.internal`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');
  createdUserIds.push(userData.user.id);

  const { data: row, error } = await service
    .from('customers')
    .insert({
      supabase_user_id: userData.user.id, email, first_name: 'Race', last_name: tag, account_type: accountType,
      status: 'pending', ship_line1: '1 Test St', ship_city: 'Toronto', ship_province: 'Ontario',
      ship_postal_code: 'M5V 1A1', signature_name: 'Race Test', signed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !row) throw error ?? new Error('customer insert failed');
  createdCustomerIds.push(row.id);
  return row.id as string;
}

async function currentStatus(id: string): Promise<string> {
  const { data } = await service.from('customers').select('status').eq('id', id).single();
  return data!.status;
}

after(async () => {
  for (const id of createdCustomerIds) await service.from('customers').delete().eq('id', id);
  for (const id of createdUserIds) await service.auth.admin.deleteUser(id);
});

describe('claim_customer_for_approval: claim+claim race', () => {
  it('two concurrent claims on the same pending row -- exactly one succeeds, the other gets a clean error, Shopify is never reached by the loser (nothing here calls Shopify -- that only happens after a successful claim, in JS)', async () => {
    const id = await makePendingCustomer('claim-claim');

    const [a, b] = await Promise.all([
      service.rpc('claim_customer_for_approval', { p_id: id }),
      service.rpc('claim_customer_for_approval', { p_id: id }),
    ]);

    const results = [a, b];
    const succeeded = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);

    assert.equal(succeeded.length, 1, 'exactly one claim should succeed');
    assert.equal(failed.length, 1, 'exactly one claim should fail');
    assert.match(failed[0].error!.message, /already decided|being processed/i);
    assert.equal(await currentStatus(id), 'approving');
  });
});

describe('reject_customer: guarded to pending-only', () => {
  it('reject succeeds on a pending row', async () => {
    const id = await makePendingCustomer('reject-ok');
    const { error } = await service.rpc('reject_customer', { p_id: id });
    assert.equal(error, null);
    assert.equal(await currentStatus(id), 'rejected');
  });

  it('reject fails cleanly on an already-approving row (claim-then-reject: the race this whole migration exists to close)', async () => {
    const id = await makePendingCustomer('claim-then-reject');
    const { error: claimError } = await service.rpc('claim_customer_for_approval', { p_id: id });
    assert.equal(claimError, null);

    const { error: rejectError } = await service.rpc('reject_customer', { p_id: id });
    assert.ok(rejectError, 'reject must fail once the row is claimed/approving');
    assert.match(rejectError!.message, /already decided/i);
    assert.equal(await currentStatus(id), 'approving', 'status must NOT have been silently overwritten to rejected');
  });

  it('claim fails cleanly on an already-rejected row (reject-then-claim, the other order)', async () => {
    const id = await makePendingCustomer('reject-then-claim');
    const { error: rejectError } = await service.rpc('reject_customer', { p_id: id });
    assert.equal(rejectError, null);

    const { error: claimError } = await service.rpc('claim_customer_for_approval', { p_id: id });
    assert.ok(claimError, 'claim must fail once the row is already rejected');
    assert.equal(await currentStatus(id), 'rejected', 'status must NOT have been silently overwritten to approving');
  });

  it('two concurrent rejects on the same pending row -- one succeeds, the other gets a clean "already decided" (harmless outcome, but must not error unclearly)', async () => {
    const id = await makePendingCustomer('reject-reject');
    const [a, b] = await Promise.all([
      service.rpc('reject_customer', { p_id: id }),
      service.rpc('reject_customer', { p_id: id }),
    ]);
    const failed = [a, b].filter((r) => r.error);
    assert.equal(failed.length, 1, 'exactly one of the two concurrent rejects should fail');
    assert.match(failed[0].error!.message, /already decided/i);
  });
});

describe('finalize_customer_approval: guarded to approving-only, uses the passed-in account_type/ship_province', () => {
  it('finalize fails on a row that was never claimed (still pending)', async () => {
    const id = await makePendingCustomer('finalize-unclaimed');
    const { error } = await service.rpc('finalize_customer_approval', {
      p_id: id, p_approved_by: 'test@example.com', p_shopify_customer_id: 'gid://shopify/Customer/1',
      p_account_type: 'wholesale', p_ship_province: 'Ontario',
    });
    assert.ok(error, 'finalize must refuse a row that was never claimed');
  });

  it('account number reflects the account_type captured at claim time, not a concurrently-switched value (the exact race 030 was written to close)', async () => {
    const id = await makePendingCustomer('claim-snapshot', 'wholesale');
    const { data: claimRows, error: claimError } = await service.rpc('claim_customer_for_approval', { p_id: id });
    assert.equal(claimError, null);
    const claim = claimRows![0];
    assert.equal(claim.account_type, 'wholesale');

    // Simulate another admin switching the account type WHILE this claim is "in flight" (the
    // real-world case: between claim and finalize, e.g. while a Shopify call is pending).
    const { error: switchError } = await service.rpc('update_customer_account_type', { p_id: id, p_account_type: 'retail' });
    assert.equal(switchError, null);

    const { error: finalizeError } = await service.rpc('finalize_customer_approval', {
      p_id: id, p_approved_by: 'test@example.com', p_shopify_customer_id: 'gid://shopify/Customer/1',
      // Using the ORIGINALLY claimed account_type, per the design -- not re-reading it.
      p_account_type: claim.account_type, p_ship_province: claim.ship_province,
    });
    assert.equal(finalizeError, null);

    const { data: finalRow } = await service.from('customers').select('account_number, account_type, status').eq('id', id).single();
    assert.equal(finalRow!.status, 'approved');
    assert.equal(finalRow!.account_type, 'retail', 'the account_type switch itself should have taken effect');
    assert.match(finalRow!.account_number!, /^W-/, 'but the account NUMBER prefix must reflect wholesale (the claim-time snapshot), not the switched-to retail type');
  });
});

describe('revert_customer_claim: returns a claimed row to pending', () => {
  it('reverts an approving row back to pending, and it becomes claimable again', async () => {
    const id = await makePendingCustomer('revert');
    await service.rpc('claim_customer_for_approval', { p_id: id });
    assert.equal(await currentStatus(id), 'approving');

    const { error: revertError } = await service.rpc('revert_customer_claim', { p_id: id });
    assert.equal(revertError, null);
    assert.equal(await currentStatus(id), 'pending');

    const { error: reclaimError } = await service.rpc('claim_customer_for_approval', { p_id: id });
    assert.equal(reclaimError, null, 'a reverted row should be claimable again, simulating a retry after a failure');
  });
});

describe('force_reset_stuck_approval: manual escape hatch, records who used it', () => {
  it('refuses to run on a row that is not actually stuck (still pending)', async () => {
    const id = await makePendingCustomer('force-reset-not-stuck');
    const { error } = await service.rpc('force_reset_stuck_approval', { p_id: id, p_reset_by: 'admin@example.com' });
    assert.ok(error, 'must refuse a row that is not in approving');
  });

  it('resets a stuck (approving) row back to pending and records who did it', async () => {
    const id = await makePendingCustomer('force-reset-stuck');
    await service.rpc('claim_customer_for_approval', { p_id: id });

    const { error } = await service.rpc('force_reset_stuck_approval', { p_id: id, p_reset_by: 'admin@example.com' });
    assert.equal(error, null);

    const { data: row } = await service.from('customers').select('status, force_reset_by, force_reset_at').eq('id', id).single();
    assert.equal(row!.status, 'pending');
    assert.equal(row!.force_reset_by, 'admin@example.com');
    assert.ok(row!.force_reset_at, 'force_reset_at should be recorded');
  });
});

describe('customers.status CHECK constraint and transition trigger (defense in depth)', () => {
  it('rejects an invalid status value outright', async () => {
    const id = await makePendingCustomer('bad-status');
    const { error } = await service.from('customers').update({ status: 'not_a_real_status' }).eq('id', id);
    assert.ok(error, 'an unrecognized status value must be rejected by the CHECK constraint');
  });

  it('rejects a disallowed transition even via a direct update (e.g. approved -> pending, bypassing every RPC)', async () => {
    const id = await makePendingCustomer('bad-transition');
    await service.rpc('claim_customer_for_approval', { p_id: id });
    await service.rpc('finalize_customer_approval', {
      p_id: id, p_approved_by: 'test@example.com', p_shopify_customer_id: 'gid://shopify/Customer/2',
      p_account_type: 'wholesale', p_ship_province: 'Ontario',
    });
    assert.equal(await currentStatus(id), 'approved');

    const { error } = await service.from('customers').update({ status: 'pending' }).eq('id', id);
    assert.ok(error, 'approved -> pending is not an allowed transition, even via a direct update');
    assert.match(error!.message, /invalid customer status transition/i);
  });
});
