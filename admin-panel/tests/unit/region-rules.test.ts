import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProvince,
  requiredRegionForProvince,
  isRegionAllowedForProvince,
  findRegionMismatches,
  REGION_RULE_ENABLED,
} from '../../src/lib/region-rules';

describe('normalizeProvince', () => {
  it('accepts codes, full names, any case, accents', () => {
    assert.equal(normalizeProvince('ON'), 'ON');
    assert.equal(normalizeProvince('on'), 'ON');
    assert.equal(normalizeProvince(' Ontario '), 'ON');
    assert.equal(normalizeProvince('Québec'), 'QC');
    assert.equal(normalizeProvince('British Columbia'), 'BC');
  });
  it('rejects unknown / non-string input', () => {
    for (const v of ['', 'XX', 'Ontari', 'ON;DROP', undefined, null, 5, {}, ['ON']]) {
      assert.equal(normalizeProvince(v), null);
    }
  });
});

describe('province -> region rule', () => {
  it('provinces with their own region need that region', () => {
    assert.equal(requiredRegionForProvince('ON'), 'ontario');
    assert.equal(requiredRegionForProvince('BC'), 'bc');
    assert.equal(requiredRegionForProvince('AB'), 'alberta');
    assert.equal(requiredRegionForProvince('MB'), 'manitoba');
    assert.equal(requiredRegionForProvince('QC'), 'quebec');
  });
  it('every other province falls back to federal', () => {
    for (const code of ['SK', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU']) {
      assert.equal(requiredRegionForProvince(code), 'federal');
    }
  });
  it('matching region ok, other region blocked, untagged product allowed anywhere', () => {
    assert.equal(isRegionAllowedForProvince('ontario', 'ON'), true);
    assert.equal(isRegionAllowedForProvince('bc', 'ON'), false);
    assert.equal(isRegionAllowedForProvince('federal', 'ON'), false);
    assert.equal(isRegionAllowedForProvince('federal', 'SK'), true);
    assert.equal(isRegionAllowedForProvince('ontario', 'SK'), false);
    assert.equal(isRegionAllowedForProvince(null, 'ON'), true);
  });
  it('findRegionMismatches returns only the offending lines', () => {
    const lines = [
      { name: 'A', region: 'ontario' },
      { name: 'B', region: 'bc' },
      { name: 'C', region: null },
    ];
    assert.deepEqual(findRegionMismatches(lines, 'ON').map((l) => l.name), ['B']);
    assert.deepEqual(findRegionMismatches(lines, 'BC').map((l) => l.name), ['A']);
    assert.deepEqual(findRegionMismatches([], 'ON'), []);
  });
});

describe('the province -> product-region shipping restriction is disabled (business decision, 2026-09-22)', () => {
  it('REGION_RULE_ENABLED is false', () => {
    assert.equal(REGION_RULE_ENABLED, false);
  });
});
