import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSalesRepInput } from '../../src/lib/sales-rep-input';

const valid = { name: 'Jane Doe', phone: '555-0100', email: 'jane@example.com' };

describe('validateSalesRepInput (N-1)', () => {
  it('accepts a normal, well-formed rep', () => {
    assert.equal(validateSalesRepInput(valid), null);
  });

  it('rejects empty or oversized name/phone/email', () => {
    assert.ok(validateSalesRepInput({ ...valid, name: '' }));
    assert.ok(validateSalesRepInput({ ...valid, name: 'a'.repeat(101) }));
    assert.ok(validateSalesRepInput({ ...valid, phone: '' }));
    assert.ok(validateSalesRepInput({ ...valid, phone: '1'.repeat(31) }));
    assert.ok(validateSalesRepInput({ ...valid, email: '' }));
    assert.ok(validateSalesRepInput({ ...valid, email: `${'a'.repeat(250)}@b.co` }));
  });

  it('rejects control characters (e.g. a stray newline/tab smuggled into a field)', () => {
    assert.ok(validateSalesRepInput({ ...valid, name: 'Jane\nDoe' }));
    assert.ok(validateSalesRepInput({ ...valid, phone: '555\t0100' }));
    assert.ok(validateSalesRepInput({ ...valid, email: 'jane@example.com\u0000' }));
  });

  it('rejects non-string input', () => {
    for (const bad of [null, undefined, 5, {}]) {
      // @ts-expect-error -- deliberately passing the wrong type
      assert.ok(validateSalesRepInput({ ...valid, name: bad }));
    }
  });
});
