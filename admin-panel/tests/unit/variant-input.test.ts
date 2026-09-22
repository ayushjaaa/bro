import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateVariantRowInput,
  validateVariantDescription,
  validatePriceInput,
  validateQuantityInput,
} from '../../src/lib/variant-input';

describe('validateVariantRowInput / validateVariantDescription (Q-3)', () => {
  it('accepts a normal flavour row', () => {
    assert.equal(validateVariantRowInput({ flavourName: 'Blue Raspberry', description: 'Sweet and tart.' }), null);
  });

  it('rejects an empty or oversized flavour name', () => {
    assert.ok(validateVariantRowInput({ flavourName: '', description: '' }));
    assert.ok(validateVariantRowInput({ flavourName: 'a'.repeat(101), description: '' }));
    assert.equal(validateVariantRowInput({ flavourName: 'a'.repeat(100), description: '' }), null);
  });

  it('rejects control characters in the flavour name', () => {
    assert.ok(validateVariantRowInput({ flavourName: 'Bad\u0000Name', description: '' }));
  });

  it('validateVariantDescription rejects an oversized description, allows newlines', () => {
    assert.equal(validateVariantDescription('a'.repeat(2000)), null);
    assert.ok(validateVariantDescription('a'.repeat(2001)));
    assert.equal(validateVariantDescription('line1\nline2'), null);
    assert.ok(validateVariantDescription('line1\u0007line2'));
  });
});

describe('validatePriceInput / validateQuantityInput (A3, PRODUCT_ERROR_HANDLING_REVIEW.md)', () => {
  it('validatePriceInput accepts a normal positive price', () => {
    assert.equal(validatePriceInput('12.99'), null);
    assert.equal(validatePriceInput('3'), null);
  });

  it('validatePriceInput rejects empty, zero, negative, and non-numeric values', () => {
    assert.ok(validatePriceInput(''));
    assert.ok(validatePriceInput('   '));
    assert.ok(validatePriceInput('0'));
    assert.ok(validatePriceInput('0.00'));
    assert.ok(validatePriceInput('-5'));
    assert.ok(validatePriceInput('abc'));
  });

  it('validateQuantityInput accepts a normal positive integer', () => {
    assert.equal(validateQuantityInput('3'), null);
    assert.equal(validateQuantityInput('1000'), null);
  });

  it('validateQuantityInput rejects empty, zero, negative, non-integer, and non-numeric values', () => {
    assert.ok(validateQuantityInput(''));
    assert.ok(validateQuantityInput('0'));
    assert.ok(validateQuantityInput('-5'));
    assert.ok(validateQuantityInput('3.5'));
    assert.ok(validateQuantityInput('abc'));
  });
});
