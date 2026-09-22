import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REGIONS as ADMIN_REGIONS } from '../../src/lib/regions';

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('rules copied between storefront and admin-panel must not drift', () => {
  it('region-rules.ts is identical apart from its own pointer comment (the file itself says "keep them identical")', () => {
    const strip = (t: string) => t.replace(/^.*is a copy of this file.*$/m, '');
    assert.equal(strip(read('admin-panel/src/lib/region-rules.ts')), strip(read('storefront/src/lib/region-rules.ts')));
  });
  it('the storefront region list is the admin list plus "all"', () => {
    const sf = read('storefront/src/lib/regions.ts');
    const values = [...sf.matchAll(/\{ value: '([a-z]+)'/g)].map((m) => m[1]);
    assert.deepEqual(values, ['all', ...ADMIN_REGIONS.map((r) => r.value)]);
  });
  it('the storefront never carries an Admin API credential name in its client-reachable env prefix, and admin does not expose the internal secret publicly', () => {
    for (const f of ['storefront/src', 'admin-panel/src']) {
      // covered in depth by storefront/tests/security/client-leak.test.ts; this is the cheap tripwire
      assert.ok(!/NEXT_PUBLIC_(INTERNAL|SERVICE_ROLE|ADMIN_TOKEN)/.test(read(f === 'storefront/src' ? 'storefront/src/proxy.ts' : 'admin-panel/src/proxy.ts')));
    }
  });
});
