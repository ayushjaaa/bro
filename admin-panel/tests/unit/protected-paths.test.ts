import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isKnownProtectedPath, PROTECTED_EXACT_PATHS } from '../../src/lib/protected-paths';

const DASHBOARD = join(__dirname, '../../src/app/(dashboard)');

/** Every page.tsx under (dashboard), as the URL a visitor would type ("[id]" filled with a sample). */
function dashboardRoutes(dir = DASHBOARD, prefix = ''): string[] {
  const routes: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      const segment = /^\(.*\)$/.test(name) ? '' : `/${name.replace(/^\[.+\]$/, 'sample-id')}`;
      routes.push(...dashboardRoutes(full, prefix + segment));
    } else if (name === 'page.tsx') {
      routes.push(prefix || '/');
    }
  }
  return routes;
}

describe('login-only admin pages are all covered by the proxy redirect list', () => {
  const routes = dashboardRoutes();

  it('finds the dashboard pages (sanity check on this test itself)', () => {
    assert.ok(routes.length >= 10, `only found: ${routes.join(', ')}`);
    assert.ok(routes.includes('/') && routes.includes('/customers'));
  });

  for (const route of routes) {
    it(`${route} is listed as protected`, () => {
      assert.ok(
        isKnownProtectedPath(route),
        `${route} is a real admin page but is missing from src/lib/protected-paths.ts -- logged-out visitors would not be redirected to /login by the proxy.`
      );
    });
  }

  it('the login page and unknown paths are NOT treated as protected', () => {
    for (const p of ['/login', '/set-password', '/auth/confirm', '/nope', '/products/a/b/c']) {
      assert.equal(isKnownProtectedPath(p), false, p);
    }
  });

  it('has no duplicate entries', () => {
    assert.equal(new Set(PROTECTED_EXACT_PATHS).size, PROTECTED_EXACT_PATHS.length);
  });
});
