/**
 * Black-box HTTP security tests against a RUNNING admin-panel (default http://localhost:4000,
 * override with ADMIN_URL). Sends real requests, exactly like Shopify (or an attacker) would, to
 * every webhook route this app exposes: /api/webhooks/products, /api/webhooks/inventory,
 * /api/webhooks/orders.
 *
 * Run: `npm run test:security` with `npm run dev` running (or ADMIN_URL pointing at a deployed
 * environment).
 *
 * Before this file, these 3 routes had ZERO automated coverage -- not even the signature-rejection
 * checks the storefront's own webhook routes already had (see storefront/tests/security/
 * http-routes.test.ts). Two gaps this file closes for BOTH apps' webhook routes:
 *   1. Rejection paths (bad/missing signature, wrong shop, GET) -- admin-panel had none of these.
 *   2. The "happy path" -- a CORRECTLY signed, correct-shop, correct-topic delivery -- was never
 *      exercised anywhere, in either app: existing tests only ever proved rejection/ignore
 *      branches. The happy-path tests below also assert the real downstream Supabase write
 *      actually landed (order_status_log / product_health_snapshot), not just a 200 response,
 *      per this repo's own testing rule ("test the boundary, not the button").
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { INVENTORY_LOCATION_ID } from '../../src/lib/inventory';

const BASE = process.env.ADMIN_URL ?? process.env.E2E_ADMIN_URL ?? 'http://localhost:4000';
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!;
const SHOP = process.env.SHOPIFY_STORE_DOMAIN!;
const LOCATION_ID_NUMERIC = INVENTORY_LOCATION_ID.split('/').pop()!;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const sign = (body: string, secret = CLIENT_SECRET) => createHmac('sha256', secret).update(body, 'utf8').digest('base64');
const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body, redirect: 'manual' });

before(async () => {
  try {
    await fetch(BASE, { redirect: 'manual' });
  } catch {
    throw new Error(`admin-panel is not running at ${BASE} -- start it with "npm run dev" first, or set ADMIN_URL`);
  }
});

// Rows created by the happy-path tests below, deleted in afterAll so this suite never leaves
// fixture data behind in a real (possibly production) Supabase project.
const createdOrderIds: string[] = [];
const createdProductIds: string[] = [];
after(async () => {
  if (createdOrderIds.length) await admin.from('order_status_log').delete().in('order_id', createdOrderIds);
  if (createdProductIds.length) await admin.from('product_health_snapshot').delete().in('product_id', createdProductIds);
});

/** Polls until `check` returns a truthy value or `timeoutMs` elapses -- the routes under test
 * intentionally don't await their Supabase writes (so Shopify's 5s delivery timeout is never at
 * risk), so the write can land a few hundred ms after the HTTP response already came back. */
async function waitFor<T>(check: () => Promise<T | null>, timeoutMs = 5000, intervalMs = 200): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// --- /api/webhooks/products --------------------------------------------------------------------

describe('admin-panel webhook /api/webhooks/products', () => {
  const fakeId = Date.now();
  const productGid = `gid://shopify/Product/${fakeId}`;
  const goodPayload = JSON.stringify({
    id: fakeId,
    title: 'webhook-security-test product',
    status: 'active',
    images: [],
    variants: [{ id: fakeId + 1, sku: 'WEBHOOK-TEST-SKU', price: '9.99', compare_at_price: null }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
  });
  const hdr = (over: Record<string, string> = {}) => ({
    'X-Shopify-Topic': 'products/update',
    'X-Shopify-Shop-Domain': SHOP,
    'X-Shopify-Webhook-Id': `sec-products-${Date.now()}-${Math.random()}`,
    ...over,
  });

  it('no signature -> 401', async () => {
    assert.equal((await post('/api/webhooks/products', goodPayload, hdr())).status, 401);
  });

  it('wrong signature (signed with a different secret) -> 401', async () => {
    assert.equal(
      (await post('/api/webhooks/products', goodPayload, hdr({ 'X-Shopify-Hmac-Sha256': sign(goodPayload, 'not-the-secret') }))).status,
      401
    );
  });

  it('a valid signature for a DIFFERENT body is rejected (tampered body)', async () => {
    assert.equal(
      (await post('/api/webhooks/products', goodPayload + ' ', hdr({ 'X-Shopify-Hmac-Sha256': sign(goodPayload) }))).status,
      401
    );
  });

  it('correctly signed but for a different shop -> accepted but IGNORED (no side effects)', async () => {
    const res = await post(
      '/api/webhooks/products',
      goodPayload,
      hdr({ 'X-Shopify-Hmac-Sha256': sign(goodPayload), 'X-Shopify-Shop-Domain': 'evil-shop.myshopify.com' })
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ignored, 'unexpected shop domain');
  });

  it('correctly signed but an unexpected topic -> IGNORED', async () => {
    const res = await post('/api/webhooks/products', goodPayload, hdr({ 'X-Shopify-Hmac-Sha256': sign(goodPayload), 'X-Shopify-Topic': 'orders/delete' }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ignored, 'unexpected topic');
  });

  it('does not accept GET (webhooks are POST only)', async () => {
    assert.equal((await fetch(BASE + '/api/webhooks/products', { redirect: 'manual' })).status, 405);
  });

  it('the same delivery id twice: the retry is skipped', async () => {
    const h = hdr({ 'X-Shopify-Hmac-Sha256': sign(goodPayload) });
    const first = await post('/api/webhooks/products', goodPayload, h);
    assert.equal(first.status, 200);
    const second = await post('/api/webhooks/products', goodPayload, h);
    assert.equal((await second.json()).ignored, 'duplicate delivery');
  });

  it('HAPPY PATH: correctly signed products/update -> 200 ok (accepted, not ignored) AND a product_health_snapshot row actually lands in Supabase', async () => {
    createdProductIds.push(productGid);
    const res = await post('/api/webhooks/products', goodPayload, hdr({ 'X-Shopify-Hmac-Sha256': sign(goodPayload) }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.ignored, undefined, 'a valid delivery must never be reported as ignored');

    // The route deliberately does NOT await this write (so Shopify's 5s timeout is never at risk)
    // -- poll for it instead of asserting immediately after the response.
    const row = await waitFor(async () => {
      const { data } = await admin.from('product_health_snapshot').select('*').eq('product_id', productGid).maybeSingle();
      return data;
    });
    assert.ok(row, 'expected a product_health_snapshot row for this webhook delivery, none appeared within 5s');
    assert.equal(row!.title, 'webhook-security-test product');
    assert.equal(row!.variant_count, 1);
    assert.equal(row!.missing_sku_count, 0);
  });
});

// --- /api/webhooks/orders ------------------------------------------------------------------------

describe('admin-panel webhook /api/webhooks/orders', () => {
  const fakeId = Date.now() + 1;
  const orderGid = `gid://shopify/Order/${fakeId}`;
  const goodPayload = JSON.stringify({ id: fakeId, financial_status: 'paid', updated_at: new Date().toISOString() });
  const hdr = (over: Record<string, string> = {}) => ({
    'X-Shopify-Topic': 'orders/create',
    'X-Shopify-Shop-Domain': SHOP,
    'X-Shopify-Webhook-Id': `sec-orders-${Date.now()}-${Math.random()}`,
    ...over,
  });

  it('no signature -> 401', async () => {
    assert.equal((await post('/api/webhooks/orders', goodPayload, hdr())).status, 401);
  });

  it('wrong signature (signed with a different secret) -> 401', async () => {
    assert.equal(
      (await post('/api/webhooks/orders', goodPayload, hdr({ 'X-Shopify-Hmac-Sha256': sign(goodPayload, 'not-the-secret') }))).status,
      401
    );
  });

  it('correctly signed but an unexpected topic -> IGNORED', async () => {
    const res = await post('/api/webhooks/orders', goodPayload, hdr({ 'X-Shopify-Hmac-Sha256': sign(goodPayload), 'X-Shopify-Topic': 'products/update' }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ignored, 'unexpected topic');
  });

  it('correctly signed but for a different shop -> accepted but IGNORED', async () => {
    const res = await post(
      '/api/webhooks/orders',
      goodPayload,
      hdr({ 'X-Shopify-Hmac-Sha256': sign(goodPayload), 'X-Shopify-Shop-Domain': 'evil-shop.myshopify.com' })
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ignored, 'unexpected shop domain');
  });

  it('does not accept GET (webhooks are POST only)', async () => {
    assert.equal((await fetch(BASE + '/api/webhooks/orders', { redirect: 'manual' })).status, 405);
  });

  it('the same delivery id twice: the retry is skipped', async () => {
    const h = hdr({ 'X-Shopify-Hmac-Sha256': sign(goodPayload) });
    const first = await post('/api/webhooks/orders', goodPayload, h);
    assert.equal(first.status, 200);
    const second = await post('/api/webhooks/orders', goodPayload, h);
    assert.equal((await second.json()).ignored, 'duplicate delivery');
  });

  it('HAPPY PATH: correctly signed orders/create -> 200 ok AND an order_status_log row actually lands in Supabase with the right status', async () => {
    createdOrderIds.push(orderGid);
    const res = await post('/api/webhooks/orders', goodPayload, hdr({ 'X-Shopify-Hmac-Sha256': sign(goodPayload) }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.ignored, undefined);

    const row = await waitFor(async () => {
      const { data } = await admin.from('order_status_log').select('*').eq('order_id', orderGid).maybeSingle();
      return data;
    });
    assert.ok(row, 'expected an order_status_log row for this webhook delivery, none appeared within 5s');
    assert.equal(row!.new_status, 'order_created');
  });
});

// --- /api/webhooks/inventory ----------------------------------------------------------------------

describe('admin-panel webhook /api/webhooks/inventory', () => {
  const hdr = (over: Record<string, string> = {}) => ({
    'X-Shopify-Topic': 'inventory_levels/update',
    'X-Shopify-Shop-Domain': SHOP,
    'X-Shopify-Webhook-Id': `sec-inventory-${Date.now()}-${Math.random()}`,
    ...over,
  });
  const bodyFor = (inventoryItemId: number, locationId: string) =>
    JSON.stringify({ inventory_item_id: inventoryItemId, location_id: Number(locationId), available: 5, updated_at: new Date().toISOString() });

  it('no signature -> 401', async () => {
    const body = bodyFor(1, LOCATION_ID_NUMERIC);
    assert.equal((await post('/api/webhooks/inventory', body, hdr())).status, 401);
  });

  it('wrong signature (signed with a different secret) -> 401', async () => {
    const body = bodyFor(1, LOCATION_ID_NUMERIC);
    assert.equal((await post('/api/webhooks/inventory', body, hdr({ 'X-Shopify-Hmac-Sha256': sign(body, 'not-the-secret') }))).status, 401);
  });

  it('correctly signed but an unexpected topic -> IGNORED', async () => {
    const body = bodyFor(1, LOCATION_ID_NUMERIC);
    const res = await post('/api/webhooks/inventory', body, hdr({ 'X-Shopify-Hmac-Sha256': sign(body), 'X-Shopify-Topic': 'products/update' }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ignored, 'unexpected topic');
  });

  it('correctly signed but for a different shop -> accepted but IGNORED', async () => {
    const body = bodyFor(1, LOCATION_ID_NUMERIC);
    const res = await post(
      '/api/webhooks/inventory',
      body,
      hdr({ 'X-Shopify-Hmac-Sha256': sign(body), 'X-Shopify-Shop-Domain': 'evil-shop.myshopify.com' })
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ignored, 'unexpected shop domain');
  });

  it('a different (non-tracked) location -> IGNORED, never reconciled', async () => {
    const body = bodyFor(1, '999999999');
    const res = await post('/api/webhooks/inventory', body, hdr({ 'X-Shopify-Hmac-Sha256': sign(body) }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ignored, 'different location');
  });

  it('does not accept GET (webhooks are POST only)', async () => {
    assert.equal((await fetch(BASE + '/api/webhooks/inventory', { redirect: 'manual' })).status, 405);
  });

  // No happy-path test here: this route is the one exception where the "correct signature, correct
  // topic, correct location" path deliberately re-queries Shopify itself for the real quantity
  // (never trusting the payload) and AWAITS that before responding, so a fabricated
  // inventory_item_id that doesn't exist on the real store is not a fake-data-friendly path the way
  // products/orders are. What IS both real and fully deterministic without a live inventory item:
  it('a well-formed, correctly-signed delivery for an inventory item Shopify does not recognise -> 503 so Shopify retries (not a silent 200, not a crash)', async () => {
    const body = bodyFor(999999999999, LOCATION_ID_NUMERIC);
    const res = await post('/api/webhooks/inventory', body, hdr({ 'X-Shopify-Hmac-Sha256': sign(body) }));
    assert.equal(res.status, 503);
    const json = await res.json();
    assert.equal(json.ok, false);
  });
});
