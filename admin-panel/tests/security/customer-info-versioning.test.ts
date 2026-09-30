/**
 * Live database tests for 031-customer-info-versioning.sql -- the optimistic-locking
 * (`version`) guard on update_customer_application_info. Run: `npm run test:security` (requires
 * 031-customer-info-versioning.sql to have been run against the live project first).
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();

const createdCustomerIds: string[] = [];
const createdUserIds: string[] = [];

async function makeCustomer(tag: string) {
  const email = `ver-${tag}-${stamp}@e2e.test.internal`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');
  createdUserIds.push(userData.user.id);

  const { data: row, error } = await service
    .from('customers')
    .insert({
      supabase_user_id: userData.user.id, email, first_name: 'Ver', last_name: tag, account_type: 'wholesale',
      status: 'pending', ship_line1: '1 Test St', ship_city: 'Toronto', ship_province: 'Ontario',
      ship_postal_code: 'M5V 1A1', signature_name: 'Ver Test', signed_at: new Date().toISOString(),
    })
    .select('id, version')
    .single();
  if (error || !row) throw error ?? new Error('customer insert failed');
  createdCustomerIds.push(row.id);
  return row as { id: string; version: number };
}

after(async () => {
  for (const id of createdCustomerIds) await service.from('customers').delete().eq('id', id);
  for (const id of createdUserIds) await service.auth.admin.deleteUser(id);
});

describe('update_customer_application_info: optimistic locking', () => {
  it('a matching version succeeds and increments the version', async () => {
    const c = await makeCustomer('match');
    const { data: newVersion, error } = await service.rpc('update_customer_application_info', {
      p_id: c.id, p_version: c.version, p_fields: { lastName: 'Updated' },
    });
    assert.equal(error, null);
    assert.equal(newVersion, c.version + 1);

    const { data: row } = await service.from('customers').select('last_name, version').eq('id', c.id).single();
    assert.equal(row!.last_name, 'Updated');
    assert.equal(row!.version, c.version + 1);
  });

  it('a stale version fails cleanly (does not silently overwrite) and does not touch the row', async () => {
    const c = await makeCustomer('stale');
    // Advance the version once, simulating another admin's edit.
    await service.rpc('update_customer_application_info', { p_id: c.id, p_version: c.version, p_fields: { lastName: 'FirstEdit' } });

    // Now try to save using the ORIGINAL (now-stale) version -- simulates a second admin who
    // loaded the form before the first admin's save.
    const { data, error } = await service.rpc('update_customer_application_info', {
      p_id: c.id, p_version: c.version, p_fields: { lastName: 'StaleEdit' },
    });
    assert.ok(error, 'a stale version must be rejected');
    assert.equal(data, null);

    const { data: row } = await service.from('customers').select('last_name').eq('id', c.id).single();
    assert.equal(row!.last_name, 'FirstEdit', 'the first admin\'s save must survive, not be overwritten by the stale one');
  });

  it('a missing/nonexistent customer id fails distinguishably from a version conflict', async () => {
    const { error } = await service.rpc('update_customer_application_info', {
      p_id: '00000000-0000-0000-0000-000000000000', p_version: 1, p_fields: { lastName: 'X' },
    });
    assert.ok(error);
    assert.match(error!.message, /not found/i);
  });

  it('a partial update only touches the fields explicitly provided, leaving everything else untouched', async () => {
    const c = await makeCustomer('partial');
    const { data: before } = await service.from('customers').select('first_name, last_name').eq('id', c.id).single();

    await service.rpc('update_customer_application_info', { p_id: c.id, p_version: c.version, p_fields: { lastName: 'OnlyLastName' } });

    const { data: after1 } = await service.from('customers').select('first_name, last_name').eq('id', c.id).single();
    assert.equal(after1!.first_name, before!.first_name, 'firstName was not in the partial update and must be untouched');
    assert.equal(after1!.last_name, 'OnlyLastName');
  });

  it('re-finalizing/re-editing repeatedly keeps incrementing version (no version reuse)', async () => {
    const c = await makeCustomer('multi');
    let version = c.version;
    for (let i = 0; i < 3; i++) {
      const { data: newVersion, error } = await service.rpc('update_customer_application_info', {
        p_id: c.id, p_version: version, p_fields: { referralSource: `edit-${i}` },
      });
      assert.equal(error, null);
      version = newVersion as number;
    }
    const { data: row } = await service.from('customers').select('version, referral_source').eq('id', c.id).single();
    assert.equal(row!.version, c.version + 3);
    assert.equal(row!.referral_source, 'edit-2');
  });
});

describe('update_customer_application_info: GENUINE concurrent saves (Promise.all, not sequential simulation)', () => {
  it('two concurrent edits on DIFFERENT fields, both starting from the same version -- exactly one wins, the other gets a clean conflict (never both silently applied)', async () => {
    const c = await makeCustomer('concurrent-diff-fields');
    const [a, b] = await Promise.all([
      service.rpc('update_customer_application_info', { p_id: c.id, p_version: c.version, p_fields: { lastName: 'FromA' } }),
      service.rpc('update_customer_application_info', { p_id: c.id, p_version: c.version, p_fields: { referralSource: 'FromB' } }),
    ]);
    const results = [a, b];
    const succeeded = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    assert.equal(succeeded.length, 1, 'exactly one concurrent save should succeed, even though they touched different fields -- the lock is per-ROW, not per-field');
    assert.equal(failed.length, 1);
    assert.match(failed[0].error!.message, /changed by someone else/i);

    // Whichever one won, the row must reflect ONLY that one's change -- never a merge of both,
    // which would mean the lock was silently bypassed.
    const { data: row } = await service.from('customers').select('last_name, referral_source').eq('id', c.id).single();
    const aWon = !a.error;
    if (aWon) {
      assert.equal(row!.last_name, 'FromA');
      assert.notEqual(row!.referral_source, 'FromB');
    } else {
      assert.equal(row!.referral_source, 'FromB');
      assert.notEqual(row!.last_name, 'FromA');
    }
  });

  it('two concurrent edits on the SAME field with different values -- exactly one wins, no data corruption', async () => {
    const c = await makeCustomer('concurrent-same-field');
    const [a, b] = await Promise.all([
      service.rpc('update_customer_application_info', { p_id: c.id, p_version: c.version, p_fields: { legalBusinessName: 'Name From A' } }),
      service.rpc('update_customer_application_info', { p_id: c.id, p_version: c.version, p_fields: { legalBusinessName: 'Name From B' } }),
    ]);
    const succeeded = [a, b].filter((r) => !r.error);
    assert.equal(succeeded.length, 1);

    const { data: row } = await service.from('customers').select('legal_business_name').eq('id', c.id).single();
    assert.ok(
      row!.legal_business_name === 'Name From A' || row!.legal_business_name === 'Name From B',
      'the final value must be cleanly one or the other, never a corrupted mix'
    );
  });
});

describe('"Tombstone" scenario: status decided (rejected) while an admin is mid-edit -- editing after the fact must not crash or corrupt anything', () => {
  it('an info-edit started before rejection still saves cleanly after the customer is rejected -- version is untouched by reject, so this is expected, not a bug (editing a rejected applicant\'s contact info for record-keeping is harmless)', async () => {
    const c = await makeCustomer('tombstone');
    // Admin B "opened the edit form" here, capturing c.version. Meanwhile admin A rejects.
    const { error: rejectError } = await service.rpc('reject_customer', { p_id: c.id });
    assert.equal(rejectError, null);

    // Admin B, unaware, saves their edit using the version they captured before the reject.
    const { data: newVersion, error: editError } = await service.rpc('update_customer_application_info', {
      p_id: c.id, p_version: c.version, p_fields: { referralSource: 'edited-after-rejection' },
    });
    assert.equal(editError, null, 'info-edit has no status guard by design -- it must not be blocked or corrupted by a status change that happened first');
    assert.equal(newVersion, c.version + 1);

    const { data: row } = await service.from('customers').select('status, referral_source').eq('id', c.id).single();
    assert.equal(row!.status, 'rejected', 'the reject itself must be unaffected by the later info-edit');
    assert.equal(row!.referral_source, 'edited-after-rejection');
  });
});

describe('Cross-cutting races: status-machine actions (030) vs info-edit (031) on the SAME row -- confirms the two guards (status vs version) do not interfere with each other', () => {
  it('claiming a customer for approval and editing its info concurrently -- both succeed independently, since they touch disjoint fields under different guards', async () => {
    const c = await makeCustomer('claim-vs-edit');
    const [claimResult, editResult] = await Promise.all([
      service.rpc('claim_customer_for_approval', { p_id: c.id }),
      service.rpc('update_customer_application_info', { p_id: c.id, p_version: c.version, p_fields: { referralSource: 'edited-during-claim' } }),
    ]);
    assert.equal(claimResult.error, null, 'claim should succeed -- info-edit never touches status');
    assert.equal(editResult.error, null, 'info-edit should succeed -- it does not check status at all, only version');

    const { data: row } = await service.from('customers').select('status, referral_source').eq('id', c.id).single();
    assert.equal(row!.status, 'approving');
    assert.equal(row!.referral_source, 'edited-during-claim');
  });

  it('rejecting a customer and switching its account type concurrently -- both succeed, no interference (previously reasoned about but not actually tested)', async () => {
    const c = await makeCustomer('reject-vs-typeswitch');
    const [rejectResult, switchResult] = await Promise.all([
      service.rpc('reject_customer', { p_id: c.id }),
      service.rpc('update_customer_account_type', { p_id: c.id, p_account_type: 'retail' }),
    ]);
    assert.equal(rejectResult.error, null);
    assert.equal(switchResult.error, null);

    const { data: row } = await service.from('customers').select('status, account_type').eq('id', c.id).single();
    assert.equal(row!.status, 'rejected');
    assert.equal(row!.account_type, 'retail');
  });

  it('two concurrent account-type switches to different values -- last-write-wins, no error, no corruption (this is the accepted/intended behavior, not a bug)', async () => {
    const c = await makeCustomer('typeswitch-typeswitch');
    const [a, b] = await Promise.all([
      service.rpc('update_customer_account_type', { p_id: c.id, p_account_type: 'retail' }),
      service.rpc('update_customer_account_type', { p_id: c.id, p_account_type: 'wholesale' }),
    ]);
    assert.equal(a.error, null);
    assert.equal(b.error, null);

    const { data: row } = await service.from('customers').select('account_type').eq('id', c.id).single();
    assert.ok(row!.account_type === 'retail' || row!.account_type === 'wholesale', 'must be cleanly one or the other');
  });
});
