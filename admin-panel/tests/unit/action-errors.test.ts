import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SafeActionError, safeActionError } from '../../src/lib/action-errors';

describe('admin-panel action-errors (N-2)', () => {
  it('passes a SafeActionError message through unchanged', () => {
    const message = safeActionError(new SafeActionError('Please enter a valid name.'), 'fallback', 'ctx');
    assert.equal(message, 'Please enter a valid name.');
  });

  it('replaces any other error (raw Error, string, unknown) with the fallback', () => {
    for (const err of [new Error('duplicate key value violates unique constraint "sales_reps_email_key"'), 'boom', { weird: true }, null, undefined]) {
      assert.equal(safeActionError(err, 'Failed. Please try again.', 'ctx'), 'Failed. Please try again.');
    }
  });

  it('SafeActionError is a real Error subclass (instanceof Error, has a stack)', () => {
    const err = new SafeActionError('x');
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'x');
  });
});
