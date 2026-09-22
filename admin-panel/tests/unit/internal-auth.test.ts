import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isInternalRequestAuthorized } from '../../src/lib/internal-auth';

const req = (secret?: string | null) => ({ headers: { get: (n: string) => (n === 'X-Internal-Secret' ? (secret ?? null) : null) } }) as any;

describe('isInternalRequestAuthorized (storefront -> admin trust boundary)', () => {
  const saved = process.env.INTERNAL_DRAFT_ORDER_SECRET;
  const savedOther = process.env.OTHER_SECRET;
  beforeEach(() => { process.env.INTERNAL_DRAFT_ORDER_SECRET = 'correct-horse-battery'; });
  afterEach(() => {
    if (saved === undefined) delete process.env.INTERNAL_DRAFT_ORDER_SECRET; else process.env.INTERNAL_DRAFT_ORDER_SECRET = saved;
    if (savedOther === undefined) delete process.env.OTHER_SECRET; else process.env.OTHER_SECRET = savedOther;
  });

  it('accepts the exact secret', () => assert.equal(isInternalRequestAuthorized(req('correct-horse-battery')), true));
  it('rejects a missing header', () => assert.equal(isInternalRequestAuthorized(req(null)), false));
  it('rejects an empty header', () => assert.equal(isInternalRequestAuthorized(req('')), false));
  it('rejects wrong value, wrong length, prefix, suffix, different case, padding', () => {
    for (const bad of ['wrong', 'correct-horse-batter', 'correct-horse-batteryX', 'CORRECT-HORSE-BATTERY', ' correct-horse-battery', 'correct-horse-battery ']) {
      assert.equal(isInternalRequestAuthorized(req(bad)), false, JSON.stringify(bad));
    }
  });
  it('FAILS CLOSED when the secret is not configured, even for an empty header', () => {
    delete process.env.INTERNAL_DRAFT_ORDER_SECRET;
    assert.equal(isInternalRequestAuthorized(req('')), false);
    assert.equal(isInternalRequestAuthorized(req('anything')), false);
    assert.equal(isInternalRequestAuthorized(req(undefined)), false);
  });
  it('uses the named variable for other internal routes, and does not fall back to the draft-order one', () => {
    process.env.OTHER_SECRET = 'other-secret-value';
    assert.equal(isInternalRequestAuthorized(req('other-secret-value'), 'OTHER_SECRET'), true);
    assert.equal(isInternalRequestAuthorized(req('correct-horse-battery'), 'OTHER_SECRET'), false);
  });
  it('multi-byte characters of equal string length but different byte length are rejected, not thrown on', () => {
    process.env.INTERNAL_DRAFT_ORDER_SECRET = 'abcd';
    assert.equal(isInternalRequestAuthorized(req('äbc')), false);
  });
});
