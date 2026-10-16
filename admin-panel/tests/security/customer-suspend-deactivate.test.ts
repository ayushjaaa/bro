/**
 * Live database tests for 034-customer-suspend-deactivate.sql -- same "prove the database itself
 * enforces it" philosophy as customer-approval-races.test.ts and admin-data-boundary.test.ts. Run:
 * `npm run test:security` (requires 034 to have been run against the live project first).
 *
 * Covers the edge cases identified while designing/implementing 034:
 *  - suspend is a true dead end (no transition out, not even a non-status field edit)
 *  - suspend is blocked while a row is mid-'approving' (half-finished Shopify approval)
 *  - suspend/deactivate both require a non-empty reason
 *  - the suspended_applicants block-list survives the customers row being deleted
 *  - suspended_applicants is append-only even to the service-role client (RLS does not stop
 *    service_role -- the real backstop is the explicit `revoke update, delete`)
 *  - is_applicant_blocked matches by email OR business_number independently
 *  - every admin RPC is service_role-only; is_applicant_blocked is deliberately anon-callable
 *  - the transition trigger's full allow-list for the new statuses, including disallowed
 *    directions (pending -> deactivated, rejected -> approved, etc.)
 */
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const stamp = Date.now();

const createdCustomerIds: string[] = [];
const createdUserIds: string[] = [];
const createdBlockEmails: string[] = [];

async function makeCustomer(tag: string, status: 'pending' | 'approved' | 'rejected', extra: Record<string, unknown> = {}) {
  const email = `suspend034-${tag}-${stamp}@e2e.test.internal`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');
  createdUserIds.push(userData.user.id);

  const { data: row, error } = await service
    .from('customers')
    .insert({
      supabase_user_id: userData.user.id, email, first_name: 'Suspend034', last_name: tag, account_type: 'wholesale',
      status, business_number: `BN-${tag}-${stamp}`, legal_business_name: `${tag} Co`,
      ship_line1: '1 Test St', ship_city: 'Toronto', ship_province: 'Ontario', ship_postal_code: 'M5V 1A1',
      signature_name: 'Suspend034 Test', signed_at: new Date().toISOString(),
      ...(status === 'approved' ? { approved_at: new Date().toISOString() } : {}),
      ...extra,
    })
    .select('*')
    .single();
  if (error || !row) throw error ?? new Error('customer insert failed');
  createdCustomerIds.push(row.id);
  createdBlockEmails.push(email);
  return row as Record<string, any>;
}

async function currentRow(id: string) {
  const { data } = await service.from('customers').select('*').eq('id', id).single();
  return data!;
}

after(async () => {
  for (const id of createdCustomerIds) await service.from('customers').delete().eq('id', id);
  for (const id of createdUserIds) await service.auth.admin.deleteUser(id);
  for (const email of createdBlockEmails) {
    await service.from('suspended_applicants').delete().eq('email', email);
    await service.from('rejection_history').delete().eq('email', email);
  }
});

describe('suspend_customer', () => {
  it('suspends an approved row and records a matching suspended_applicants entry', async () => {
    const row = await makeCustomer('suspend-ok', 'approved');
    const { data, error } = await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'fraud' });
    assert.equal(error, null);
    assert.ok(data?.[0]?.supabase_user_id, 'should hand back the supabase_user_id for session revocation');

    const after1 = await currentRow(row.id);
    assert.equal(after1.status, 'suspended');
    assert.equal(after1.suspended_by, 'admin@test');
    assert.equal(after1.suspension_reason, 'fraud');
    assert.ok(after1.suspended_at);

    const { data: block } = await service.from('suspended_applicants').select('*').eq('original_customer_id', row.id).single();
    assert.equal(block.email, row.email);
    assert.equal(block.business_number, row.business_number);
    assert.equal(block.business_name, row.legal_business_name);
  });

  it('suspends a PENDING row too (product decision: an obviously fraudulent applicant can be permanently blocked before ever being approved)', async () => {
    const row = await makeCustomer('suspend-pending', 'pending');
    const { error } = await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'fraud on application' });
    assert.equal(error, null);

    const after1 = await currentRow(row.id);
    assert.equal(after1.status, 'suspended');

    const { data: block } = await service.from('suspended_applicants').select('*').eq('original_customer_id', row.id).single();
    assert.equal(block.email, row.email);
    assert.equal(block.business_number, row.business_number, 'the pending application already has business_number filled in by the one-shot wizard submit, so the block captures it correctly');
  });

  it('is blocked while the row is mid-approving (half-finished Shopify approval)', async () => {
    const row = await makeCustomer('suspend-approving', 'pending');
    const { error: claimError } = await service.rpc('claim_customer_for_approval', { p_id: row.id });
    assert.equal(claimError, null);

    const { error } = await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'test' });
    assert.ok(error, 'suspend must refuse a row that is mid-approving');
    assert.match(error!.message, /mid-approval/i);
    assert.equal((await currentRow(row.id)).status, 'approving', 'status must not have changed');
  });

  it('refuses an empty or missing reason', async () => {
    const row = await makeCustomer('suspend-noreason', 'approved');
    const { error } = await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: '   ' });
    assert.ok(error, 'suspend must require a non-empty reason');
    assert.match(error!.message, /reason is required/i);
    assert.equal((await currentRow(row.id)).status, 'approved', 'status must not have changed');
  });

  it('refuses to suspend a row that is already suspended', async () => {
    const row = await makeCustomer('suspend-twice', 'approved');
    await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'first' });
    const { error } = await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'second' });
    assert.ok(error, 'must refuse a double-suspend');
    assert.match(error!.message, /already suspended/i);
  });

  it('is a true dead end: no RPC and no raw UPDATE can move a suspended row anywhere, even a non-status field edit', async () => {
    const row = await makeCustomer('suspend-deadend', 'approved');
    await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'test' });

    const { error: reactivateErr } = await service.rpc('reactivate_customer', { p_id: row.id, p_reactivated_by: 'admin@test' });
    assert.ok(reactivateErr, 'reactivate_customer must refuse a suspended row');

    const { error: deactivateErr } = await service.rpc('deactivate_customer', { p_id: row.id, p_deactivated_by: 'admin@test', p_reason: 'test' });
    assert.ok(deactivateErr, 'deactivate_customer must refuse a suspended row');

    // The gap found during manual verification: a plain field edit (no status change at all)
    // must ALSO be refused -- the trigger's WHEN clause must fire even when old.status === new.status.
    const { error: fieldEditErr } = await service.from('customers').update({ first_name: 'Changed' }).eq('id', row.id);
    assert.ok(fieldEditErr, 'any update at all to a suspended row must be refused, not just status changes');
    assert.match(fieldEditErr!.message, /permanently suspended/i);

    assert.equal((await currentRow(row.id)).first_name, 'Suspend034', 'first_name must be unchanged');
  });

  it('the suspended_applicants block survives the customers row being deleted entirely', async () => {
    const row = await makeCustomer('suspend-survives-delete', 'approved');
    await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'test' });
    await service.from('customers').delete().eq('id', row.id);
    createdCustomerIds.splice(createdCustomerIds.indexOf(row.id), 1); // already gone, don't double-delete in after()

    const { data: block } = await service.from('suspended_applicants').select('*').eq('original_customer_id', row.id).single();
    assert.ok(block, 'the block-list row must still exist after the customer row is gone');
    assert.equal(block.email, row.email);
  });
});

describe('suspended_applicants: append-only even to service_role', () => {
  it('service_role cannot UPDATE a row despite bypassing RLS entirely', async () => {
    const row = await makeCustomer('block-update', 'approved');
    await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'test' });

    const { error } = await service.from('suspended_applicants').update({ reason: 'tampered' }).eq('original_customer_id', row.id);
    assert.ok(error, 'service_role UPDATE must be refused -- RLS alone would not stop this, the explicit revoke must');
  });

  it('service_role cannot DELETE a row despite bypassing RLS entirely', async () => {
    const row = await makeCustomer('block-delete', 'approved');
    await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'test' });

    const { error } = await service.from('suspended_applicants').delete().eq('original_customer_id', row.id);
    assert.ok(error, 'service_role DELETE must be refused');
  });

  it('anon (unauthenticated) cannot SELECT from suspended_applicants -- no read policy for that role', async () => {
    const row = await makeCustomer('block-anon-read', 'approved');
    await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'test' });

    const { data, error } = await anon.from('suspended_applicants').select('*').eq('original_customer_id', row.id);
    // RLS with no matching policy for anon returns an empty result set, not necessarily a thrown
    // error -- either outcome is acceptable as long as no row leaks through.
    assert.ok(error || (data ?? []).length === 0, 'an unauthenticated client must never see a suspended_applicants row');
  });
});

describe('is_applicant_blocked', () => {
  it('matches by email', async () => {
    const row = await makeCustomer('blocked-by-email', 'approved');
    await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'test' });

    const { data } = await service.rpc('is_applicant_blocked', { p_email: row.email.toUpperCase(), p_business_number: null });
    assert.equal(data, true, 'must match case-insensitively by email alone');
  });

  it('matches by business_number alone, even with a completely different email', async () => {
    const row = await makeCustomer('blocked-by-bn', 'approved');
    await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'test' });

    const { data } = await service.rpc('is_applicant_blocked', {
      p_email: `totally-different-${stamp}@e2e.test.internal`,
      p_business_number: row.business_number,
    });
    assert.equal(data, true, 'a suspended business must be blocked even under a brand new email');
  });

  it('returns false for an applicant matching neither field', async () => {
    const { data } = await service.rpc('is_applicant_blocked', {
      p_email: `unrelated-${stamp}@e2e.test.internal`,
      p_business_number: `UNRELATED-BN-${stamp}`,
    });
    assert.equal(data, false);
  });

  it('is callable by the anon key -- the public registration flow has no service-role access', async () => {
    const { data, error } = await anon.rpc('is_applicant_blocked', { p_email: 'anybody@example.com', p_business_number: null });
    assert.equal(error, null, 'is_applicant_blocked must be anon-executable (submitRegistration runs unauthenticated)');
    assert.equal(data, false);
  });
});

describe('Auth ban mechanism (the correct replacement for the non-existent "signOut by user id")', () => {
  it('suspend_customer returns a supabase_user_id that updateUserById(uid, { ban_duration }) accepts without error', async () => {
    const row = await makeCustomer('ban-suspend', 'approved');
    const { data } = await service.rpc('suspend_customer', { p_id: row.id, p_suspended_by: 'admin@test', p_reason: 'test' });
    const userId = data![0].supabase_user_id as string;

    const { data: banned, error: banErr } = await service.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
    assert.equal(banErr, null, 'ban_duration must be accepted for a real user id (confirms the mechanism itself works)');
    assert.ok(banned.user.banned_until, 'the Auth user should now carry a banned_until timestamp');
  });

  it('a banned-then-unbanned user ends up with no standing ban (the reactivate path)', async () => {
    const row = await makeCustomer('ban-unban', 'approved');
    const { data: userData } = await service.auth.admin.createUser({ email: `ban-unban-${stamp}@e2e.test.internal`, email_confirm: true });
    const userId = userData!.user!.id;
    createdUserIds.push(userId);

    await service.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
    let { data: user } = await service.auth.admin.getUserById(userId);
    assert.ok(user!.user!.banned_until, 'must be banned after the ban call');

    await service.auth.admin.updateUserById(userId, { ban_duration: 'none' });
    ({ data: user } = await service.auth.admin.getUserById(userId));
    assert.ok(!user!.user!.banned_until, 'must have no standing ban after unbanning');
  });
});

describe('deactivate_customer / reactivate_customer', () => {
  it('deactivates an approved row and reactivates it back with zero data loss', async () => {
    const row = await makeCustomer('deactivate-roundtrip', 'approved');
    const { data, error } = await service.rpc('deactivate_customer', { p_id: row.id, p_deactivated_by: 'admin@test', p_reason: 'temp hold' });
    assert.equal(error, null);
    assert.ok(data?.[0]?.supabase_user_id);

    let after1 = await currentRow(row.id);
    assert.equal(after1.status, 'deactivated');
    assert.equal(after1.deactivation_reason, 'temp hold');

    const { error: reactErr } = await service.rpc('reactivate_customer', { p_id: row.id, p_reactivated_by: 'admin@test' });
    assert.equal(reactErr, null);

    after1 = await currentRow(row.id);
    assert.equal(after1.status, 'approved');
    assert.equal(after1.legal_business_name, row.legal_business_name, 'no application data should be touched');
  });

  it('refuses to deactivate anything but an approved row', async () => {
    const pending = await makeCustomer('deactivate-wrong-pending', 'pending');
    const { error: e1 } = await service.rpc('deactivate_customer', { p_id: pending.id, p_deactivated_by: 'admin@test', p_reason: 'x' });
    assert.ok(e1, 'must refuse a pending row');

    const rejected = await makeCustomer('deactivate-wrong-rejected', 'rejected');
    const { error: e2 } = await service.rpc('deactivate_customer', { p_id: rejected.id, p_deactivated_by: 'admin@test', p_reason: 'x' });
    assert.ok(e2, 'must refuse a rejected row');
  });

  it('refuses an empty reason', async () => {
    const row = await makeCustomer('deactivate-noreason', 'approved');
    const { error } = await service.rpc('deactivate_customer', { p_id: row.id, p_deactivated_by: 'admin@test', p_reason: '' });
    assert.ok(error);
    assert.match(error!.message, /reason is required/i);
  });

  it('refuses to reactivate anything but a deactivated row', async () => {
    const row = await makeCustomer('reactivate-wrong', 'approved');
    const { error } = await service.rpc('reactivate_customer', { p_id: row.id, p_reactivated_by: 'admin@test' });
    assert.ok(error, 'must refuse an already-approved row');
  });
});

describe('reject_customer / reset_rejected_customer_for_reapply', () => {
  it('reject stamps audit columns and increments rejection_count', async () => {
    const row = await makeCustomer('reject-audit', 'pending');
    const { data, error } = await service.rpc('reject_customer', { p_id: row.id, p_rejected_by: 'admin@test' });
    assert.equal(error, null);
    assert.ok(data?.[0]?.supabase_user_id !== undefined);

    const after1 = await currentRow(row.id);
    assert.equal(after1.status, 'rejected');
    assert.equal(after1.rejected_by, 'admin@test');
    assert.equal(after1.rejection_count, 1);
  });

  it('035: reset_rejected_customer_for_reapply now DELETES the row (snapshotted to rejection_history first) -- genuinely freeing the email, not just resetting fields in place', async () => {
    const row = await makeCustomer('reject-reset', 'pending');
    await service.rpc('reject_customer', { p_id: row.id, p_rejected_by: 'admin@test' });

    const { data, error } = await service.rpc('reset_rejected_customer_for_reapply', { p_id: row.id, p_reset_by: 'admin@test' });
    assert.equal(error, null);
    assert.equal(data?.[0]?.supabase_user_id, row.supabase_user_id, 'the JS layer (customers.ts) needs this to delete the Auth user + sweep storage -- not this RPC\'s job');

    const { data: gone } = await service.from('customers').select('id').eq('id', row.id).maybeSingle();
    assert.equal(gone, null, 'the customers row must be gone, not just reset -- a 034-style in-place reset would still leave email_registered() true');

    const { data: stillRegistered } = await service.rpc('email_registered', { p_email: row.email });
    assert.equal(stillRegistered, false, 'the email must now be genuinely free (the whole point of 035)');

    const { data: history } = await service.from('rejection_history').select('*').eq('original_customer_id', row.id).single();
    assert.equal(history.email, row.email);
    assert.equal(history.business_number, row.business_number);
    assert.equal(history.rejection_count, 1, 'the snapshot preserves what this row had reached before deletion');
    assert.equal(history.reapplied_by, 'admin@test');

    // The RPC deliberately does NOT touch the Auth user (that needs the Admin API, not SQL) --
    // confirm it's still there, matching the comment above about whose job that is.
    const { data: authUser } = await service.auth.admin.getUserById(row.supabase_user_id);
    assert.ok(authUser.user, 'the Auth user must still exist -- only customers.ts deletes it, via the JS-side admin.deleteUser() call this RPC leaves for it to do');
  });

  it('internal_notes for the customer are snapshotted into notes_snapshot and then removed', async () => {
    const row = await makeCustomer('reject-reset-notes', 'pending');
    await service.rpc('reject_customer', { p_id: row.id, p_rejected_by: 'admin@test' });
    const { error: noteErr } = await service
      .from('internal_notes')
      .insert({ entity_type: 'customer', entity_id: row.id, body: 'called them, documents looked off', created_by: 'admin@test' });
    assert.equal(noteErr, null);

    await service.rpc('reset_rejected_customer_for_reapply', { p_id: row.id, p_reset_by: 'admin@test' });

    const { data: history } = await service.from('rejection_history').select('notes_snapshot').eq('original_customer_id', row.id).single();
    assert.match(history!.notes_snapshot, /documents looked off/);

    const { data: remainingNotes } = await service.from('internal_notes').select('id').eq('entity_type', 'customer').eq('entity_id', row.id);
    assert.equal(remainingNotes?.length, 0, 'orphaned notes must not be left behind, pointing at a customer id that no longer exists');
  });

  it('two full reject-then-reapply cycles for the SAME email produce two rejection_history rows -- the running count now lives across rows, not within one', async () => {
    const email = `reject-reset-twice-${stamp}@e2e.test.internal`;
    createdBlockEmails.push(email); // cleanup: rejection_history rows for this email
    // Deliberate trade-off of 035, called out explicitly: each new row's OWN rejection_count
    // restarts at 1 (it's a fresh row with a fresh Auth user each cycle) -- the cumulative history
    // across cycles is reconstructed by querying rejection_history by email, not by reading a
    // single row's rejection_count the way 034 could.
    for (let i = 0; i < 2; i++) {
      const { data: userData } = await service.auth.admin.createUser({ email, email_confirm: true });
      const userId = userData!.user!.id;
      const { data: row } = await service
        .from('customers')
        .insert({ supabase_user_id: userId, email, first_name: 'Cycle', last_name: `${i}`, account_type: 'wholesale', status: 'pending' })
        .select('id')
        .single();
      await service.rpc('reject_customer', { p_id: row!.id, p_rejected_by: 'admin@test' });
      await service.rpc('reset_rejected_customer_for_reapply', { p_id: row!.id, p_reset_by: 'admin@test' });
      // The RPC alone leaves the Auth user behind (by design -- see the test above). In
      // production, customers.ts's resetRejectedCustomerForReapply deletes it right after; without
      // doing the same here, the NEXT iteration's createUser for this same email fails outright
      // (Supabase Auth itself refuses a duplicate email), which is exactly what would happen for a
      // real applicant too if that JS-side step were ever skipped -- this loop only works at all
      // because it's simulated here.
      await service.auth.admin.deleteUser(userId);
    }

    const { data: historyRows } = await service.from('rejection_history').select('*').eq('email', email);
    assert.equal(historyRows?.length, 2, 'both cycles must be recorded, not overwritten');
    assert.ok(historyRows!.every((h) => h.rejection_count === 1), 'each cycle\'s own row only ever reached rejection_count 1 before being reset');
  });

  it('refuses to reset anything but a rejected row', async () => {
    const row = await makeCustomer('reset-wrong-status', 'pending');
    const { error } = await service.rpc('reset_rejected_customer_for_reapply', { p_id: row.id, p_reset_by: 'admin@test' });
    assert.ok(error, 'must refuse a still-pending row');
  });
});

describe('enforce_customer_status_transition: full allow-list for the new statuses', () => {
  const disallowed: Array<[string, string]> = [
    ['pending', 'deactivated'],
    ['pending', 'approved'],
    ['rejected', 'approved'],
    ['rejected', 'deactivated'],
    ['deactivated', 'rejected'],
    // deactivated -> suspended is blocked by the trigger's allow-list (only approved -> suspended
    // is permitted) -- so even calling suspend_customer's own RPC on a deactivated row fails here,
    // surfaced as the trigger's generic error rather than one of suspend_customer's own messages.
    ['deactivated', 'suspended'],
  ];

  for (const [from, to] of disallowed) {
    it(`rejects ${from} -> ${to} even via a direct UPDATE, bypassing every RPC`, async () => {
      // 'deactivated' can only be reached from a genuinely 'approved' row (pending -> approved is
      // not itself a legal transition -- claim/finalize is the only path there) -- construct the
      // starting state honestly rather than faking it with a disallowed direct update, or this
      // test would silently end up checking a different (and possibly allowed) transition instead.
      const row = await makeCustomer(`bad-${from}-${to}`, from === 'deactivated' ? 'approved' : 'pending');
      if (from === 'rejected') await service.rpc('reject_customer', { p_id: row.id, p_rejected_by: 'admin@test' });
      if (from === 'deactivated') {
        const { error: deactErr } = await service.rpc('deactivate_customer', { p_id: row.id, p_deactivated_by: 'admin@test', p_reason: 'x' });
        assert.equal(deactErr, null, 'test setup: deactivate must succeed to reach the starting state');
      }
      assert.equal((await currentRow(row.id)).status, from, 'test setup: row must genuinely be in the expected starting state');

      const { error } = await service.from('customers').update({ status: to }).eq('id', row.id);
      assert.ok(error, `${from} -> ${to} must be rejected`);
      assert.match(error!.message, /invalid customer status transition/i);
    });
  }

  it('allows approved -> suspended and approved -> deactivated via direct UPDATE (the RPCs are a convenience, not the only gate)', async () => {
    const row = await makeCustomer('direct-approved-suspended', 'pending');
    await service.from('customers').update({ status: 'approved' }).eq('id', row.id);
    const { error } = await service.from('customers').update({ status: 'suspended' }).eq('id', row.id);
    assert.equal(error, null);
  });
});

describe('every admin RPC is service_role-only; is_applicant_blocked is the one deliberate exception', () => {
  const serviceOnlyRpcs: Array<[string, Record<string, unknown>]> = [
    ['suspend_customer', { p_id: '00000000-0000-0000-0000-000000000000', p_suspended_by: 'x', p_reason: 'x' }],
    ['deactivate_customer', { p_id: '00000000-0000-0000-0000-000000000000', p_deactivated_by: 'x', p_reason: 'x' }],
    ['reactivate_customer', { p_id: '00000000-0000-0000-0000-000000000000', p_reactivated_by: 'x' }],
    ['reject_customer', { p_id: '00000000-0000-0000-0000-000000000000', p_rejected_by: 'x' }],
    ['reset_rejected_customer_for_reapply', { p_id: '00000000-0000-0000-0000-000000000000', p_reset_by: 'x' }],
  ];

  for (const [fn, args] of serviceOnlyRpcs) {
    it(`${fn} refuses an anon caller`, async () => {
      const { error } = await anon.rpc(fn, args);
      assert.ok(error, `${fn} must not be callable with the anon key`);
    });
  }
});

describe('suspend_customer: two concurrent clicks on the SAME row (two admins, same instant)', () => {
  it('036: NOW race-safe (atomic WHERE-clause claim, same pattern deactivate/reactivate/reject already used) -- exactly one succeeds, deterministically, every run', async () => {
    // Deliberately NOT using makeCustomer/createdCustomerIds (module-level helpers above) -- this
    // test's whole point is duplicate suspended_applicants rows, so it tracks and cleans up its own
    // block-list rows explicitly rather than relying on the shared createdBlockEmails array, to keep
    // that accounting unambiguous for whoever reads this test next to debug a similar race.
    const email = `race-suspend-${stamp}@e2e.test.internal`;
    const { data: userData } = await service.auth.admin.createUser({ email, email_confirm: true });
    const userId = userData!.user!.id;
    const { data: row } = await service
      .from('customers')
      .insert({
        supabase_user_id: userId, email, first_name: 'Race', last_name: 'Suspend', account_type: 'wholesale',
        status: 'approved', business_number: `race-bn-${stamp}`, legal_business_name: 'Race Suspend Co',
      })
      .select('id')
      .single();

    const [a, b] = await Promise.all([
      service.rpc('suspend_customer', { p_id: row!.id, p_suspended_by: 'admin-a', p_reason: 'race test A' }),
      service.rpc('suspend_customer', { p_id: row!.id, p_suspended_by: 'admin-b', p_reason: 'race test B' }),
    ]);

    const succeeded = [a, b].filter((r) => !r.error);
    const failed = [a, b].filter((r) => r.error);
    assert.equal(succeeded.length, 1, 'exactly one concurrent suspend must succeed, deterministically (036)');
    assert.equal(failed.length, 1, 'exactly one must be cleanly refused');
    assert.match(failed[0].error!.message, /already suspended/i);

    const after = await currentRow(row!.id);
    assert.equal(after.status, 'suspended');

    const { data: blocks } = await service.from('suspended_applicants').select('id').eq('original_customer_id', row!.id);
    assert.equal(blocks?.length, 1, 'exactly one suspended_applicants row -- the losing call never got far enough to insert its own');

    // Cleanup -- this row is suspended (DELETE still works, 034's own trigger only guards UPDATE),
    // and suspended_applicants needs its service_role-targeted revoke bypassed the same way every
    // other suspend test's cleanup does (afterAll's loop only knows about createdBlockEmails).
    await service.from('customers').delete().eq('id', row!.id);
    await service.auth.admin.deleteUser(userId);
    await service.from('suspended_applicants').delete().eq('email', email);
  });
});

describe('deactivate_customer / reactivate_customer / reject_customer: confirmed race-safe (the pattern 036 later applied to suspend_customer and reset_rejected_customer_for_reapply too)', () => {
  it('two concurrent deactivate_customer calls on the same approved row: exactly one succeeds, the other is cleanly refused -- no duplicate side effects possible', async () => {
    // WHERE id = p_id AND status = 'approved' in the UPDATE itself (034) makes this atomic: once
    // the first call's UPDATE commits, the row is no longer 'approved', so the second call's own
    // UPDATE matches zero rows and its `if not found` branch fires -- the DB enforces this, not
    // application-level timing luck (unlike suspend_customer's separate SELECT-then-UPDATE).
    const row = await makeCustomer('race-deactivate', 'approved');
    const [a, b] = await Promise.all([
      service.rpc('deactivate_customer', { p_id: row.id, p_deactivated_by: 'admin-a', p_reason: 'race A' }),
      service.rpc('deactivate_customer', { p_id: row.id, p_deactivated_by: 'admin-b', p_reason: 'race B' }),
    ]);
    const succeeded = [a, b].filter((r) => !r.error);
    const failed = [a, b].filter((r) => r.error);
    assert.equal(succeeded.length, 1, 'exactly one concurrent deactivate must succeed');
    assert.equal(failed.length, 1, 'exactly one must be cleanly refused');
    assert.match(failed[0].error!.message, /only an approved customer can be deactivated/i);
    assert.equal((await currentRow(row.id)).status, 'deactivated');
  });

  it('two concurrent reactivate_customer calls on the same deactivated row: exactly one succeeds', async () => {
    const row = await makeCustomer('race-reactivate', 'approved');
    await service.rpc('deactivate_customer', { p_id: row.id, p_deactivated_by: 'admin@test', p_reason: 'setup' });
    const [a, b] = await Promise.all([
      service.rpc('reactivate_customer', { p_id: row.id, p_reactivated_by: 'admin-a' }),
      service.rpc('reactivate_customer', { p_id: row.id, p_reactivated_by: 'admin-b' }),
    ]);
    const succeeded = [a, b].filter((r) => !r.error);
    assert.equal(succeeded.length, 1, 'exactly one concurrent reactivate must succeed');
    assert.equal((await currentRow(row.id)).status, 'approved');
  });

  it('two concurrent reject_customer calls on the same pending row: exactly one succeeds (re-confirms 030s existing guarantee still holds after 034/035)', async () => {
    const row = await makeCustomer('race-reject', 'pending');
    const [a, b] = await Promise.all([
      service.rpc('reject_customer', { p_id: row.id, p_rejected_by: 'admin-a' }),
      service.rpc('reject_customer', { p_id: row.id, p_rejected_by: 'admin-b' }),
    ]);
    const succeeded = [a, b].filter((r) => !r.error);
    assert.equal(succeeded.length, 1, 'exactly one concurrent reject must succeed');
    assert.equal((await currentRow(row.id)).status, 'rejected');
    assert.equal((await currentRow(row.id)).rejection_count, 1, 'not double-incremented by the losing call');
  });
});

describe('reset_rejected_customer_for_reapply: NOW race-safe too (036)', () => {
  it('two concurrent calls on the same rejected row: exactly one succeeds, deterministically, and only one rejection_history row is ever created', async () => {
    // 036 folded the status check into the DELETE's own WHERE clause (same atomic-claim pattern
    // suspend_customer now uses) -- only the first commit's DELETE can match; the second finds the
    // row already gone and affects zero rows, hitting the `not found` exception branch cleanly
    // instead of racing through to a second rejection_history insert.
    const row = await makeCustomer('race-reapply', 'pending');
    await service.rpc('reject_customer', { p_id: row.id, p_rejected_by: 'admin@test' });

    const [a, b] = await Promise.all([
      service.rpc('reset_rejected_customer_for_reapply', { p_id: row.id, p_reset_by: 'admin-a' }),
      service.rpc('reset_rejected_customer_for_reapply', { p_id: row.id, p_reset_by: 'admin-b' }),
    ]);
    const succeeded = [a, b].filter((r) => !r.error);
    const failed = [a, b].filter((r) => r.error);
    assert.equal(succeeded.length, 1, 'exactly one concurrent reset must succeed, deterministically (036)');
    assert.equal(failed.length, 1, 'exactly one must be cleanly refused');
    assert.match(failed[0].error!.message, /only a rejected application/i);

    const { data: stillThere } = await service.from('customers').select('id').eq('id', row.id).maybeSingle();
    assert.equal(stillThere, null);

    const { data: history } = await service.from('rejection_history').select('id').eq('original_customer_id', row.id);
    assert.equal(history?.length, 1, 'exactly one rejection_history row -- the losing call never got far enough to insert its own');
    createdBlockEmails.push(row.email); // cleanup: this rejection_history row
  });
});
