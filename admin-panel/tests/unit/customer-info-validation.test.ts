import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCustomerInfoUpdate, MAX_TEXT_LENGTH } from '../../src/lib/customer-info-validation';

test('accepts an empty partial update (no fields touched)', () => {
  assert.equal(validateCustomerInfoUpdate({}), null);
});

test('accepts a valid partial update', () => {
  assert.equal(validateCustomerInfoUpdate({ lastName: 'Smith', shipPostalCode: 'M5V 1A1' }), null);
});

test('rejects a required field explicitly set to empty', () => {
  assert.match(validateCustomerInfoUpdate({ firstName: '' }) ?? '', /first name/i);
  assert.match(validateCustomerInfoUpdate({ lastName: '   ' }) ?? '', /last name/i);
  assert.match(validateCustomerInfoUpdate({ legalBusinessName: '' }) ?? '', /legal business name/i);
  assert.match(validateCustomerInfoUpdate({ shipLine1: '' }) ?? '', /shipping address/i);
});

test('does not require a field that was not touched (partial-update semantics)', () => {
  // firstName is normally required, but it's absent here -- only fields present in the object
  // are checked, since this is a partial update of an already-valid row, not a fresh application.
  assert.equal(validateCustomerInfoUpdate({ lastName: 'OnlyThis' }), null);
});

test('rejects an invalid shipping province', () => {
  const err = validateCustomerInfoUpdate({ shipProvince: 'Not A Real Province' });
  assert.match(err ?? '', /valid shipping province/i);
});

test('accepts a valid shipping province by code or full name', () => {
  assert.equal(validateCustomerInfoUpdate({ shipProvince: 'ON' }), null);
  assert.equal(validateCustomerInfoUpdate({ shipProvince: 'Ontario' }), null);
});

test('rejects an invalid Canadian postal code', () => {
  assert.match(validateCustomerInfoUpdate({ shipPostalCode: '12345' }) ?? '', /postal code/i);
  assert.match(validateCustomerInfoUpdate({ shipPostalCode: 'not a code' }) ?? '', /postal code/i);
});

test('accepts a valid Canadian postal code with or without a space', () => {
  assert.equal(validateCustomerInfoUpdate({ shipPostalCode: 'M5V1A1' }), null);
  assert.equal(validateCustomerInfoUpdate({ shipPostalCode: 'M5V 1A1' }), null);
});

test('billing province/postal code are only checked when provided (billSameAsShipping case)', () => {
  assert.equal(validateCustomerInfoUpdate({ billProvince: '' }), null, 'empty billing province is fine -- billing may follow shipping');
});

test('rejects an invalid billing postal code when one is provided', () => {
  assert.match(validateCustomerInfoUpdate({ billPostalCode: 'nope' }) ?? '', /billing postal code/i);
});

test('rejects a numStores out of range', () => {
  assert.match(validateCustomerInfoUpdate({ numStores: -1 }) ?? '', /number of stores/i);
  assert.match(validateCustomerInfoUpdate({ numStores: 999999 }) ?? '', /number of stores/i);
});

test('accepts a valid numStores, including zero', () => {
  assert.equal(validateCustomerInfoUpdate({ numStores: 0 }), null);
  assert.equal(validateCustomerInfoUpdate({ numStores: 5 }), null);
});

test('rejects a field longer than MAX_TEXT_LENGTH', () => {
  const err = validateCustomerInfoUpdate({ referralSource: 'x'.repeat(MAX_TEXT_LENGTH + 1) });
  assert.match(err ?? '', /too long/i);
});

test('rejects too many business types', () => {
  const err = validateCustomerInfoUpdate({ businessTypes: Array.from({ length: 21 }, (_, i) => `type-${i}`) });
  assert.match(err ?? '', /too many business types/i);
});
