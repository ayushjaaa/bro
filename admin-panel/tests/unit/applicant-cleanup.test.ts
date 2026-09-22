import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CLEANUP_WINDOW_MS, decideCleanup, parseCleanupInput } from '../../src/lib/applicant-cleanup';

const ID = '3f2b8c1e-9a4d-4e6b-8c7a-1d2e3f4a5b6c';
const NOW = Date.parse('2026-09-21T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('delete-applicant: request body', () => {
  it('accepts exactly { userId: <uuid> } and lower-cases it', () => {
    assert.equal(parseCleanupInput({ userId: ID }), ID);
    assert.equal(parseCleanupInput({ userId: ID.toUpperCase() }), ID);
  });
  it('rejects anything else: extra keys, non-uuid, wrong types, arrays, null', () => {
    for (const bad of [
      { userId: ID, extra: 1 }, { userId: 'abc' }, { userId: `${ID}x` }, { userId: 5 }, { userId: null },
      { user_id: ID }, {}, [], [ID], null, undefined, 'str', 7, { userId: "' or 1=1 --" },
    ]) assert.equal(parseCleanupInput(bad), null, JSON.stringify(bad));
  });
});

describe('delete-applicant: who may be removed (a leaked secret must not delete real people)', () => {
  it('allows a just-created account with no application that is not an admin', () => {
    assert.deepEqual(decideCleanup({ createdAt: ago(30_000), hasCustomerRow: false, isAdmin: false, now: NOW }), { ok: true });
    assert.deepEqual(decideCleanup({ createdAt: ago(CLEANUP_WINDOW_MS), hasCustomerRow: false, isAdmin: false, now: NOW }), { ok: true });
  });
  it('refuses an admin, even a brand-new one', () => {
    assert.deepEqual(decideCleanup({ createdAt: ago(1000), hasCustomerRow: false, isAdmin: true, now: NOW }), { ok: false, reason: 'is_admin' });
  });
  it('refuses anyone who already has an application (pending, approved or rejected)', () => {
    assert.deepEqual(decideCleanup({ createdAt: ago(1000), hasCustomerRow: true, isAdmin: false, now: NOW }), { ok: false, reason: 'has_application' });
  });
  it('refuses an account older than the window', () => {
    assert.deepEqual(decideCleanup({ createdAt: ago(CLEANUP_WINDOW_MS + 1), hasCustomerRow: false, isAdmin: false, now: NOW }), { ok: false, reason: 'too_old' });
    assert.deepEqual(decideCleanup({ createdAt: ago(30 * 24 * 3600_000), hasCustomerRow: false, isAdmin: false, now: NOW }), { ok: false, reason: 'too_old' });
  });
  it('refuses a missing / unparsable / future creation date (fails closed)', () => {
    for (const createdAt of [null, undefined, '', 'not a date', new Date(NOW + 3600_000).toISOString()]) {
      assert.equal(decideCleanup({ createdAt, hasCustomerRow: false, isAdmin: false, now: NOW }).ok, false, String(createdAt));
    }
  });
});
