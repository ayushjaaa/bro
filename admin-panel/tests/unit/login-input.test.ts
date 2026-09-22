import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLoginInput, loginErrorMessage, LOGIN_FAILED_MESSAGE, LOGIN_RATE_LIMITED_MESSAGE } from '../../src/lib/login-input';

describe('admin login input (direct-POST safe)', () => {
  it('accepts a normal email + password and trims the email', () => {
    assert.deepEqual(parseLoginInput('  a@b.co ', 'secret'), { email: 'a@b.co', password: 'secret' });
  });

  it('rejects non-string arguments (object, array, number, null, undefined)', () => {
    for (const bad of [{ a: 1 }, ['a@b.co'], 5, null, undefined]) {
      assert.equal(parseLoginInput(bad, 'x'), null);
      assert.equal(parseLoginInput('a@b.co', bad), null);
    }
  });

  it('rejects empty, malformed and oversized values', () => {
    assert.equal(parseLoginInput('', 'x'), null);
    assert.equal(parseLoginInput('a@b.co', ''), null);
    assert.equal(parseLoginInput('not-an-email', 'x'), null);
    assert.equal(parseLoginInput('a b@c.co', 'x'), null);
    assert.equal(parseLoginInput(`${'a'.repeat(250)}@b.co`, 'x'), null);
    assert.equal(parseLoginInput('a@b.co', 'x'.repeat(129)), null);
  });

  it('shows the throttling notice only for a rate-limit code; everything else is the same generic message', () => {
    assert.equal(loginErrorMessage('over_request_rate_limit'), LOGIN_RATE_LIMITED_MESSAGE);
    for (const code of ['invalid_credentials', 'user_not_found', 'email_not_confirmed', '', null, undefined]) {
      assert.equal(loginErrorMessage(code), LOGIN_FAILED_MESSAGE);
    }
  });
});
