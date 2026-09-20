import { NextResponse, type NextRequest, after } from 'next/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { INVENTORY_LOCATION_ID } from '@/lib/inventory';
import { getCurrentAvailableQuantity } from '@/lib/shopify/inventory-webhook-queries';
import { verifyShopifyHmac, WebhookIdDedup } from '@/lib/webhooks/verify';

// HMAC verification needs Node's crypto.timingSafeEqual, not available on the edge runtime.
export const runtime = 'nodejs';

// --- In-memory state -----------------------------------------------------------------------
// Single-process state only -- fine for this app today (one dev server, no deployment yet). If
// this ever runs across multiple instances, each instance would have its own blind dedup/debounce
// state -- not solved here, since correctness never depends on this layer working (see plan doc):
// a fresh page load always re-fetches from Shopify directly, and every write is protected
// independently by Shopify's own changeFromQuantity compare-and-swap.

const webhookDedup = new WebhookIdDedup();

// Per-item debounce with a GUARANTEED trailing check: a burst of several genuinely different
// events for the same inventory_item_id within a short window re-queries Shopify only once
// immediately, then exactly once more right as the window closes -- so the final settled value is
// never permanently missed. This is throttle-with-trailing-call, not naive debounce-and-forget.
const DEBOUNCE_WINDOW_MS = 2000;
const lastQueriedAt = new Map<string, number>(); // inventoryItemId -> ms epoch of last re-query
const pendingTrailing = new Map<string, { latestUpdatedAt: string }>();

function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// One retry with a short fixed backoff -- covers the transient network blips actually observed in
// production against this store (a `fetch failed`/`ETIMEDOUT` calling Shopify's Admin API), which
// otherwise silently drop the whole reconcile since nothing else re-attempts THIS specific call.
async function getCurrentAvailableQuantityWithRetry(inventoryItemId: string) {
  const first = await getCurrentAvailableQuantity(inventoryItemId, INVENTORY_LOCATION_ID);
  if (first !== null) return first;
  await new Promise((resolve) => setTimeout(resolve, 500));
  return getCurrentAvailableQuantity(inventoryItemId, INVENTORY_LOCATION_ID);
}

/** Re-queries Shopify and, if usable, conditionally writes it to Supabase (both the raw snapshot
 * and the store-wide aggregates, kept consistent in one atomic call). Shared by both the
 * immediate path and the trailing-check path. `orderingTimestamp` is only ever used for ordering
 * (never for the quantity itself -- that always comes from a fresh Shopify query, per the "never
 * trust the payload" rule, since Shopify has a documented bug where the payload's own `available`
 * can be wrong when several items change close together).
 *
 * Returns whether the reconcile actually landed in Supabase -- the immediate/leading-edge caller
 * uses this to decide whether Shopify should be told to retry the whole webhook delivery (see
 * POST below). Live-verified 2026-09-18: both the Shopify re-query and the Supabase write can fail
 * with a transient network error (`fetch failed` / `ETIMEDOUT` to Shopify, `SocketError: other
 * side closed` to Supabase) -- before this, such a failure was silently swallowed (the route
 * always told Shopify `200 OK` regardless), so a stock change with no FOLLOW-UP change on the same
 * item could stay wrong in Supabase indefinitely. */
async function reconcileOneItem(inventoryItemId: string, orderingTimestamp: string): Promise<boolean> {
  lastQueriedAt.set(inventoryItemId, Date.now());

  const result = await getCurrentAvailableQuantityWithRetry(inventoryItemId);
  if (result === null) return false;

  const supabase = getServiceRoleClient();
  const { error } = await supabase.rpc('sync_inventory_and_aggregates', {
    p_inventory_item_id: inventoryItemId,
    p_location_id: INVENTORY_LOCATION_ID,
    p_quantity: result.quantity,
    p_shopify_updated_at: orderingTimestamp,
    p_variant_id: result.variantId,
  });
  if (error) {
    console.error('[inventory-webhook] Supabase sync failed:', error);
    return false;
  }

  if (result.handle) {
    void notifyStorefrontRevalidate(result.handle);
  }
  return true;
}

// Fire-and-forget: the storefront's cache being briefly stale is never a correctness problem
// (addToCart always re-checks live against Shopify regardless of what the page showed), so a slow
// or unreachable storefront must never hold up or fail this webhook's own response to Shopify.
async function notifyStorefrontRevalidate(handle: string) {
  const baseUrl = process.env.STOREFRONT_INTERNAL_URL;
  const secret = process.env.INTERNAL_REVALIDATE_SECRET;
  if (!baseUrl || !secret) {
    console.error('[inventory-webhook] STOREFRONT_INTERNAL_URL or INTERNAL_REVALIDATE_SECRET not set -- skipping storefront revalidate');
    return;
  }
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/internal/revalidate-product`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': secret,
        // storefront's own Vercel deployment is Protection-gated -- lets this internal call
        // through. Absent locally (no Vercel Protection there), harmless no-op in dev.
        ...(process.env.STOREFRONT_PROTECTION_BYPASS
          ? { 'x-vercel-protection-bypass': process.env.STOREFRONT_PROTECTION_BYPASS }
          : {}),
      },
      body: JSON.stringify({ handle }),
    });
    if (!res.ok) {
      console.error(`[inventory-webhook] storefront revalidate failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error('[inventory-webhook] storefront revalidate request failed:', err);
  }
}

/**
 * Leading edge (nothing in-flight recently for this item): returns the in-flight reconcile promise
 * so the caller can await it and tell Shopify the truth. Inside the debounce window: schedules
 * exactly one trailing check via `after()` (Next's "run this after the response is sent, but keep
 * the function alive until it finishes" primitive -- a bare `setTimeout` here would risk never
 * firing at all once a serverless function's execution is frozen/recycled post-response) and
 * returns `null`, since a burst of several deliveries collapses into one trailing check that isn't
 * tied to any single delivery's own success/failure.
 */
function scheduleOrRunReconcile(inventoryItemId: string, updatedAt: string): Promise<boolean> | null {
  const last = lastQueriedAt.get(inventoryItemId) ?? 0;
  const elapsed = Date.now() - last;

  if (elapsed >= DEBOUNCE_WINDOW_MS) {
    return reconcileOneItem(inventoryItemId, updatedAt);
  }

  // Inside the debounce window: don't query again now, but guarantee exactly one trailing check
  // fires right when the window ends, carrying the LATEST updatedAt seen so far.
  const existing = pendingTrailing.get(inventoryItemId);
  if (existing) {
    if (updatedAt > existing.latestUpdatedAt) existing.latestUpdatedAt = updatedAt;
    return null; // a trailing check is already scheduled -- do not schedule a second one
  }

  const remaining = DEBOUNCE_WINDOW_MS - elapsed;
  pendingTrailing.set(inventoryItemId, { latestUpdatedAt: updatedAt });
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, remaining));
    const pending = pendingTrailing.get(inventoryItemId);
    pendingTrailing.delete(inventoryItemId);
    await reconcileOneItem(inventoryItemId, pending?.latestUpdatedAt ?? updatedAt);
  });
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Raw body FIRST -- HMAC verification needs the exact bytes Shopify signed; parsing JSON
    //    first can produce a byte-different string and break it.
    const rawBody = await request.text();

    // 2. HMAC verification before any parsing -- the trust boundary for this entire route.
    const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
    if (!(await verifyShopifyHmac(rawBody, hmacHeader))) {
      return NextResponse.json({ error: 'HMAC verification failed' }, { status: 401 });
    }

    // 3. Cheap header sanity checks.
    const topic = request.headers.get('X-Shopify-Topic');
    const shopDomain = request.headers.get('X-Shopify-Shop-Domain');
    if (topic !== 'inventory_levels/update') {
      return NextResponse.json({ ok: true, ignored: 'unexpected topic' }, { status: 200 });
    }
    if (shopDomain !== process.env.SHOPIFY_STORE_DOMAIN) {
      return NextResponse.json({ ok: true, ignored: 'unexpected shop domain' }, { status: 200 });
    }

    // 4. True-duplicate-delivery dedup (Shopify's own retries).
    const webhookId = request.headers.get('X-Shopify-Webhook-Id');
    if (webhookDedup.isDuplicate(webhookId)) {
      return NextResponse.json({ ok: true, ignored: 'duplicate delivery' }, { status: 200 });
    }

    // 5. Parse JSON now that HMAC + header checks have passed.
    const payload = JSON.parse(rawBody) as {
      inventory_item_id: number;
      location_id: number;
      available: number; // deliberately never read -- see reconcileOneItem's comment
      updated_at: string;
    };

    // 6. Location filter -- numeric REST-style location_id in the payload vs. the GID this app
    //    tracks. Cheap, and must happen before any Shopify query.
    const payloadLocationGid = `gid://shopify/Location/${payload.location_id}`;
    if (payloadLocationGid !== INVENTORY_LOCATION_ID) {
      return NextResponse.json({ ok: true, ignored: 'different location' }, { status: 200 });
    }

    // 7. Per-item debounce+trailing, then (if not deferred) the Shopify re-query + Supabase write
    //    happen inside scheduleOrRunReconcile/reconcileOneItem. A deferred (debounced) call
    //    returns null immediately -- an in-progress burst-collapse isn't tied to this one
    //    delivery's outcome, so this response is still fast, same as before.
    const inventoryItemGid = `gid://shopify/InventoryItem/${payload.inventory_item_id}`;
    const immediateReconcile = scheduleOrRunReconcile(inventoryItemGid, payload.updated_at);

    if (immediateReconcile !== null) {
      // Leading-edge call: DOES get awaited here (unlike before) so a genuine failure can tell
      // Shopify to retry via its own webhook redelivery, instead of silently succeeding while
      // Supabase stays stale. Normally fast (tens to low hundreds of ms, per production logs);
      // worst case (a real network timeout) makes this response itself slow, which Shopify treats
      // as a failed delivery anyway -- so either path converges on "Shopify knows to retry".
      const succeeded = await immediateReconcile;
      if (!succeeded) {
        return NextResponse.json({ ok: false, error: 'reconcile failed, please retry' }, { status: 503 });
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[inventory-webhook] Unhandled error:', err);
    // Still 200: a malformed payload we can't recover from shouldn't cause Shopify to keep
    // retrying it forever, or eventually disable the whole subscription because of it.
    return NextResponse.json({ ok: true, error: 'unhandled error, logged' }, { status: 200 });
  }
}
