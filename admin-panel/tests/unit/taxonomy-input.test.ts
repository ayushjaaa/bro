import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateTaxonomyEntryInput } from '../../src/lib/taxonomy-input';

describe('validateTaxonomyEntryInput (Q-3)', () => {
  it('accepts a normal name, with or without a description', () => {
    assert.equal(validateTaxonomyEntryInput({ name: 'Rolling Papers' }), null);
    assert.equal(validateTaxonomyEntryInput({ name: 'Rolling Papers', description: 'Thin and slow-burning.' }), null);
  });

  it('rejects an empty or whitespace-only name', () => {
    assert.ok(validateTaxonomyEntryInput({ name: '' }));
    assert.ok(validateTaxonomyEntryInput({ name: '   ' }));
  });

  it('rejects a name or description over the length cap', () => {
    assert.ok(validateTaxonomyEntryInput({ name: 'a'.repeat(101) }));
    assert.equal(validateTaxonomyEntryInput({ name: 'a'.repeat(100) }), null);
    assert.ok(validateTaxonomyEntryInput({ name: 'ok', description: 'a'.repeat(2001) }));
    assert.equal(validateTaxonomyEntryInput({ name: 'ok', description: 'a'.repeat(2000) }), null);
  });

  it('rejects control characters in name/description but allows newlines in description', () => {
    assert.ok(validateTaxonomyEntryInput({ name: 'Bad\u0000Name' }));
    assert.ok(validateTaxonomyEntryInput({ name: 'ok', description: 'line1\u0007line2' }));
    assert.equal(validateTaxonomyEntryInput({ name: 'ok', description: 'line1\nline2' }), null);
  });
});
