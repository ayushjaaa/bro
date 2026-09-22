import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findStockShortfalls, describeShortfalls, type VariantStock } from '../../src/lib/inventory-rules';

const stock = (o: Partial<VariantStock> = {}): VariantStock => ({
  productTitle: 'Item', tracked: true, policy: 'DENY', quantity: 5, ...o,
});
const m = (entries: Record<string, VariantStock>) => new Map(Object.entries(entries));

describe('findStockShortfalls', () => {
  it('within stock is fine, exactly at stock is fine', () => {
    assert.deepEqual(findStockShortfalls([{ variantId: 'a', quantity: 5 }], m({ a: stock() })), []);
  });

  it('over stock is a shortfall with the available number', () => {
    const r = findStockShortfalls([{ variantId: 'a', quantity: 6 }], m({ a: stock() }));
    assert.equal(r.length, 1);
    assert.equal(r[0].available, 5);
    assert.equal(r[0].requested, 6);
  });

  it('adds up the same variant appearing on several lines', () => {
    const r = findStockShortfalls(
      [{ variantId: 'a', quantity: 3 }, { variantId: 'a', quantity: 3 }],
      m({ a: stock() })
    );
    assert.equal(r.length, 1);
    assert.equal(r[0].requested, 6);
  });

  it('negative stock counts as zero available', () => {
    const r = findStockShortfalls([{ variantId: 'a', quantity: 1 }], m({ a: stock({ quantity: -4 }) }));
    assert.equal(r[0].available, 0);
  });

  it('untracked variants and "continue selling" variants are never limited (backorder by design)', () => {
    assert.deepEqual(findStockShortfalls([{ variantId: 'a', quantity: 999 }], m({ a: stock({ tracked: false }) })), []);
    assert.deepEqual(findStockShortfalls([{ variantId: 'a', quantity: 999 }], m({ a: stock({ policy: 'CONTINUE' }) })), []);
  });

  it('a variant missing from the stock map is left to the caller (not a shortfall here)', () => {
    assert.deepEqual(findStockShortfalls([{ variantId: 'zzz', quantity: 1 }], m({})), []);
  });

  it('reports every short variant, and describes them for the buyer', () => {
    const r = findStockShortfalls(
      [{ variantId: 'a', quantity: 9 }, { variantId: 'b', quantity: 1 }, { variantId: 'c', quantity: 1 }],
      m({ a: stock({ productTitle: 'A', quantity: 2 }), b: stock({ productTitle: 'B', quantity: 0 }), c: stock({ productTitle: 'C' }) })
    );
    assert.deepEqual(r.map((s) => s.variantId), ['a', 'b']);
    assert.equal(describeShortfalls(r), 'A (only 2 available), B (out of stock)');
  });
});
