import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFilterKeys } from '../../src/lib/product-filter-input';

const knownKeys = new Set(['material', 'size']);

describe('validateFilterKeys (Q-1)', () => {
  it('accepts empty filterValues and values whose keys are all known', () => {
    assert.equal(validateFilterKeys({}, knownKeys), null);
    assert.equal(validateFilterKeys({ material: 'Hemp' }, knownKeys), null);
    assert.equal(validateFilterKeys({ material: 'Hemp', size: 'King' }, knownKeys), null);
  });

  it('rejects a key not in the known set (a forged/unknown filter key)', () => {
    assert.ok(validateFilterKeys({ made_up_key: 'x' }, knownKeys));
  });

  it('rejects "region" even if it were somehow in the known set (structural, always reserved)', () => {
    assert.ok(validateFilterKeys({ region: 'federal' }, new Set(['region', 'material'])));
    assert.ok(validateFilterKeys({ region: 'federal' }, knownKeys));
  });
});
