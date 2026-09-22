import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCreateDraftOrderInput, MAX_BODY_CHARS } from '../../src/lib/shopify/draft-order-input';

const address = { firstName: 'A', lastName: 'B', address1: '1 Main St', city: 'Toronto', provinceCode: 'ON', zip: 'M5V 2A8' };
const valid = () => ({
  lineItems: [{ variantId: 'gid://shopify/ProductVariant/47265614004422', quantity: 3 }],
  email: 'x@y.com',
  customerId: '3f2b8c1e-9a4d-4e7b-8c55-0a1b2c3d4e5f',
  fulfillmentMethod: 'ship',
  shippingAddress: address,
  billingAddress: address,
});

const ok = (v: unknown) => parseCreateDraftOrderInput(v).ok;

describe('create-draft-order payload validation', () => {
  it('accepts the exact shape the storefront sends (ship, and pickup)', () => {
    assert.equal(ok(valid()), true);
    const { shippingAddress: _s, ...rest } = valid();
    assert.equal(ok({ ...rest, fulfillmentMethod: 'pickup', pickupLocationName: 'Warehouse 1' }), true);
    assert.equal(ok({ ...valid(), note: 'leave at door', discountCode: 'SAVE10' }), true);
    assert.equal(ok({ ...valid(), note: undefined, discountCode: '', shippingAddress: { ...address, address2: '' } }), true);
  });

  it('rejects non-objects and empty / missing required fields', () => {
    for (const v of [null, undefined, 'x', 5, [], {}]) assert.equal(ok(v), false);
    assert.equal(ok({ ...valid(), lineItems: [] }), false);
    assert.equal(ok({ ...valid(), customerId: undefined }), false);
  });

  it('customerId must be a uuid', () => {
    for (const id of ['1', 'admin', "x' or 1=1", '3f2b8c1e-9a4d-4e7b-8c55', 5]) {
      assert.equal(ok({ ...valid(), customerId: id }), false);
    }
  });

  it('variant ids must be real ProductVariant gids', () => {
    for (const id of ['47265614004422', 'gid://shopify/Product/1', 'gid://shopify/ProductVariant/abc', 'gid://shopify/ProductVariant/1; drop', '']) {
      assert.equal(ok({ ...valid(), lineItems: [{ variantId: id, quantity: 1 }] }), false, id);
    }
  });

  it('quantity must be an integer from 1 to 10,000', () => {
    for (const q of [0, -1, 1.5, 10_001, NaN, Infinity, '3', null]) {
      assert.equal(ok({ ...valid(), lineItems: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: q }] }), false, String(q));
    }
    assert.equal(ok({ ...valid(), lineItems: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 10_000 }] }), true);
  });

  it('caps the number of lines', () => {
    const line = { variantId: 'gid://shopify/ProductVariant/1', quantity: 1 };
    assert.equal(ok({ ...valid(), lineItems: Array(200).fill(line) }), true);
    assert.equal(ok({ ...valid(), lineItems: Array(201).fill(line) }), false);
  });

  it('fulfillment method is an allow-list and needs its own detail', () => {
    assert.equal(ok({ ...valid(), fulfillmentMethod: 'courier' }), false);
    const { shippingAddress: _s, ...noShip } = valid();
    assert.equal(ok(noShip), false); // ship without shippingAddress
    assert.equal(ok({ ...noShip, fulfillmentMethod: 'pickup' }), false); // pickup without a location
    assert.equal(ok({ ...noShip, fulfillmentMethod: 'pickup', pickupLocationName: '   ' }), false);
  });

  it('caps free-text lengths and refuses control characters', () => {
    assert.equal(ok({ ...valid(), note: 'x'.repeat(1001) }), false);
    assert.equal(ok({ ...valid(), discountCode: 'x'.repeat(101) }), false);
    assert.equal(ok({ ...valid(), note: 'bad\u0000note' }), false);
    assert.equal(ok({ ...valid(), shippingAddress: { ...address, address1: 'x'.repeat(201) } }), false);
    assert.equal(ok({ ...valid(), shippingAddress: { ...address, city: '' } }), false);
  });

  it('O-3: firstName / lastName cannot be blank -- an order must not reach Shopify with an empty name', () => {
    assert.equal(ok({ ...valid(), shippingAddress: { ...address, firstName: '' } }), false);
    assert.equal(ok({ ...valid(), shippingAddress: { ...address, lastName: '' } }), false);
    assert.equal(ok({ ...valid(), billingAddress: { ...address, firstName: '' } }), false);
    assert.equal(ok({ ...valid(), billingAddress: { ...address, lastName: '' } }), false);
  });

  it('returns issues for the log but never throws', () => {
    const r = parseCreateDraftOrderInput({ ...valid(), customerId: 'nope' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.issues.some((i) => i.startsWith('customerId')));
    assert.ok(MAX_BODY_CHARS > 1000);
  });
});
