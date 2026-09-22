import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateNoteBody } from '../../src/lib/note-input';

describe('validateNoteBody (N-1)', () => {
  it('accepts ordinary note text', () => {
    assert.equal(validateNoteBody('Called customer, confirmed address.'), null);
  });

  it('rejects empty or whitespace-only bodies', () => {
    assert.ok(validateNoteBody(''));
    assert.ok(validateNoteBody('   '));
  });

  it('rejects a body over the length cap', () => {
    assert.ok(validateNoteBody('a'.repeat(5001)));
    assert.equal(validateNoteBody('a'.repeat(5000)), null);
  });

  it('rejects non-string input', () => {
    for (const bad of [null, undefined, 5, {}]) {
      // @ts-expect-error -- deliberately passing the wrong type
      assert.ok(validateNoteBody(bad));
    }
  });
});
