import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addressSnapshotMetafield, parseAddressSnapshot } from '../../src/lib/shopify/order-address-snapshot';

const ship = { firstName: 'A', lastName: 'B', address1: '137 Main St', city: 'Calgary', provinceCode: 'AB', zip: 'T2E 7A4', countryCode: 'CA' };

describe('order address snapshot', () => {
  it('round-trips through the metafield value', () => {
    const mf = addressSnapshotMetafield({ shipping: ship, billing: null });
    assert.equal(mf.namespace, '$app');
    assert.equal(mf.type, 'json');
    assert.deepEqual(parseAddressSnapshot(mf.value), { shipping: ship, billing: null });
  });

  it('treats missing or malformed values as "no snapshot", never throws', () => {
    assert.equal(parseAddressSnapshot(null), null);
    assert.equal(parseAddressSnapshot(''), null);
    assert.equal(parseAddressSnapshot('{not json'), null);
    assert.deepEqual(parseAddressSnapshot('{"shipping":{"city":"X"}}'), { shipping: null, billing: null });
  });
});
