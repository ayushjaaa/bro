/**
 * Guard rail for the admin panel: every data function and Server Action is reachable by a direct
 * POST, so "the page is hidden" protects nothing (Next.js data-security guide). This static test
 * walks the code and fails when something is added without an admin check.
 *
 *  1. DATA LAYER  -- every exported async function in src/data/*.ts calls requireAdmin(), unless it is
 *                    on the reviewed list below (with a reason).
 *  2. NOT EXPOSED -- the few unguarded data helpers may only be imported by route handlers under
 *                    app/api/internal/ (behind the shared secret) or by lib/, never by an action/page/component.
 *  3. ACTIONS     -- every exported function of a 'use server' file calls a guarded data function, unless listed.
 *  4. PAGES       -- every page.tsx lives under (dashboard)/ (its layout calls requireAdmin) or is a reviewed public page.
 *  5. LAYOUT      -- (dashboard)/layout.tsx really calls requireAdmin() and redirects.
 *  6. server-only -- every data module is marked server-only (a client import fails the build).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');
const rel = (f: string) => relative(SRC, f).split('\\').join('/');
const read = (f: string) => readFileSync(f, 'utf8');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const all = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

function exportedFunctions(source: string) {
  return source
    .split(/^(?=export (?:async )?function )/m)
    .map((body) => ({ body, m: body.match(/^export (async )?function (\w+)/) }))
    .filter((x) => x.m)
    .map((x) => ({ name: x.m![2], isAsync: Boolean(x.m![1]), body: x.body }));
}

/** Unguarded on purpose. Each entry needs a reason. */
const DATA_LAYER_NOT_ADMIN_GATED: Record<string, string> = {
  'data/admin-auth.ts:signOutAdmin': 'signing out needs no admin rights (it only ends the caller\'s own session)',
  'data/customer-account-type.ts:getAccountTypeForCustomer': 'used by the internal draft-order flow (shared-secret route), no admin session exists there',
  'data/customer-order-identity.ts:getApprovedCustomerForOrder': 'used by the internal draft-order flow (shared-secret route), no admin session exists there',
  'data/customer-shopify-id.ts:getShopifyCustomerIdForCustomer': 'used by the internal order-history routes (shared-secret), no admin session exists there',
  'data/customer-shopify-id.ts:getCustomerOrderContactInfo': 'used by the internal order-detail route (shared-secret), no admin session exists there',
};

/** Server Actions that are public / need no admin data guard on purpose. */
const PUBLIC_ACTIONS: Record<string, string> = {
  'app/(auth)/login/actions.ts:signIn': 'the login itself; it checks admin_users right after sign-in and signs the session out if it fails',
  'features/auth/actions.ts:signOutAction': 'ends the caller\'s own session',
};

/** Pages that are public on purpose (everything else must sit under (dashboard)/). */
const PUBLIC_PAGES: Record<string, string> = {
  'app/(auth)/login/page.tsx': 'the login form',
  'app/(auth)/set-password/page.tsx': 'invite / recovery landing; needs the one-time session from /auth/confirm to do anything',
};

const dataFiles = all.filter((f) => /^data\//.test(rel(f)));
const guardedDataFns = new Set<string>();
for (const f of dataFiles) {
  for (const fn of exportedFunctions(read(f))) if (/requireAdmin\(/.test(fn.body)) guardedDataFns.add(fn.name);
}

describe('1. Data layer: every exported async function checks requireAdmin()', () => {
  it('finds the data modules (guards against the scan matching nothing)', () => {
    assert.ok(dataFiles.length >= 10, `only found ${dataFiles.length}`);
    assert.ok(guardedDataFns.size >= 30, `only found ${guardedDataFns.size} guarded functions`);
  });

  for (const f of dataFiles) {
    for (const fn of exportedFunctions(read(f)).filter((x) => x.isAsync)) {
      const key = `${rel(f)}:${fn.name}`;
      it(`${key} is admin-gated or on the reviewed list`, () => {
        if (/requireAdmin\(/.test(fn.body)) return;
        assert.ok(key in DATA_LAYER_NOT_ADMIN_GATED, `${key} has no requireAdmin() and is not on the reviewed list`);
      });
    }
  }

  it('the reviewed list has no stale entries', () => {
    const existing = new Set(dataFiles.flatMap((f) => exportedFunctions(read(f)).map((fn) => `${rel(f)}:${fn.name}`)));
    for (const key of Object.keys(DATA_LAYER_NOT_ADMIN_GATED)) assert.ok(existing.has(key), `stale entry: ${key}`);
  });
});

describe('2. The unguarded data helpers are not reachable from actions, pages or components', () => {
  const helperFiles = ['customer-account-type', 'customer-order-identity', 'customer-shopify-id'];
  const importers = all.filter((f) => helperFiles.some((h) => new RegExp(`from ['"]@/data/${h}['"]`).test(read(f))));

  it('finds at least one importer (so the check is real)', () => assert.ok(importers.length >= 1));

  for (const f of importers) {
    it(`${rel(f)} is a shared-secret route handler or a lib module`, () => {
      const ok = /^app\/api\/internal\/.*route\.ts$/.test(rel(f)) || /^lib\//.test(rel(f));
      assert.ok(ok, `${rel(f)} imports an unguarded data helper but is neither app/api/internal/**/route.ts nor lib/`);
      assert.ok(!/^['"]use (server|client)['"]/.test(read(f).trimStart()), `${rel(f)} is a 'use server'/'use client' file`);
    });
  }
});

describe("3. Server Actions: every exported action reaches an admin-gated data function (or is reviewed)", () => {
  const actionFiles = all.filter((f) => /^['"]use server['"]/.test(read(f).trimStart()));

  it('finds the action files', () => assert.ok(actionFiles.length >= 6, `only found ${actionFiles.length}`));

  for (const f of actionFiles) {
    for (const fn of exportedFunctions(read(f))) {
      const key = `${rel(f)}:${fn.name}`;
      it(`${key} calls a guarded data function or is on the public list`, () => {
        if (key in PUBLIC_ACTIONS) return;
        const callsGuarded = [...guardedDataFns].some((g) => new RegExp(`\\b${g}\\(`).test(fn.body));
        assert.ok(callsGuarded, `${key} does not call any requireAdmin()-guarded data function and is not on the public list`);
      });
    }
  }

  it('the public list has no stale entries', () => {
    const existing = new Set(actionFiles.flatMap((f) => exportedFunctions(read(f)).map((fn) => `${rel(f)}:${fn.name}`)));
    for (const key of Object.keys(PUBLIC_ACTIONS)) assert.ok(existing.has(key), `stale entry: ${key}`);
  });
});

describe('4. Pages: every page is under (dashboard)/ or is a reviewed public page', () => {
  const pages = all.filter((f) => /\/page\.tsx$/.test(f));
  it('finds the pages', () => assert.ok(pages.length >= 10));
  for (const f of pages) {
    it(`${rel(f)}`, () => {
      const r = rel(f);
      assert.ok(r.startsWith('app/(dashboard)/') || r in PUBLIC_PAGES, `${r} is outside (dashboard)/ and not on the public list`);
    });
  }
  it('the public list has no stale entries', () => {
    for (const key of Object.keys(PUBLIC_PAGES)) assert.ok(pages.map(rel).includes(key), `stale entry: ${key}`);
  });
});

describe('5. The dashboard layout is the real gate', () => {
  const layout = read(join(SRC, 'app/(dashboard)/layout.tsx'));
  it('calls requireAdmin()', () => assert.match(layout, /requireAdmin\(/));
  it("redirects to /login when the check fails (only a service hiccup shows a retry page)", () => {
    assert.match(layout, /redirect\('\/login'\)/);
    assert.match(layout, /AdminCheckUnavailableError/);
  });
});

describe('6. Data modules are server-only', () => {
  for (const f of dataFiles) {
    it(`${rel(f)} imports 'server-only'`, () => assert.match(read(f), /import ['"]server-only['"]/));
  }
});
