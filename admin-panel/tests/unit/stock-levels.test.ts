import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLowStock, isOutOfStock, LOW_STOCK_THRESHOLD } from '../../src/features/dashboard/lib/stock-levels';

describe('dashboard stock levels', () => {
  it('oversold (negative) counts as out of stock, not as neither', () => {
    assert.equal(isOutOfStock(-2), true);
    assert.equal(isLowStock(-2), false);
  });

  it('zero is out of stock; 1..threshold-1 is low; threshold and above is fine', () => {
    assert.equal(isOutOfStock(0), true);
    assert.equal(isLowStock(1), true);
    assert.equal(isLowStock(LOW_STOCK_THRESHOLD - 1), true);
    assert.equal(isLowStock(LOW_STOCK_THRESHOLD), false);
    assert.equal(isOutOfStock(LOW_STOCK_THRESHOLD), false);
  });
});
