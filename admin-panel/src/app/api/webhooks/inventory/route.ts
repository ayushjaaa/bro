import { NextResponse, type NextRequest } from 'next/server';
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
const pendingTrailing = new Map<string, { timer: NodeJS.Timeout; latestUpdatedAt: string }>();

function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Re-queries Shopify and, if usable, conditionally writes it to Supabase (both the raw snapshot
 * and the store-wide aggregates, kept consistent in one atomic call). Shared by both the
 * immediate path and the trailing-check path. `orderingTimestamp` is only ever used for ordering
 * (never for the quantity itself -- that always comes from a fresh Shopify query, per the "never
 * trust the payload" rule, since Shopify has a documented bug where the payload's own `available`
 * can be wrong when several items change close together). */
async function reconcileOneItem(inventoryItemId: string, orderingTimestamp: string) {
  lastQueriedAt.set(inventoryItemId, Date.now());

  const quantity = await getCurrentAvailableQuantity(inventoryItemId, INVENTORY_LOCATION_ID);
  if (quantity === null) return; // Shopify query failed -- safe to drop; a later webhook, the
  // 5-min client-side reconciliation poll, or a plain page load will pick up the true value.

  const supabase = getServiceRoleClient();
  const { error } = await supabase.rpc('sync_inventory_and_aggregates', {
    p_inventory_item_id: inventoryItemId,
    p_location_id: INVENTORY_LOCATION_ID,
    p_quantity: quantity,
    p_shopify_updated_at: orderingTimestamp,
  });
  if (error) console.error('[inventory-webhook] Supabase sync failed:', error);
}

function scheduleOrRunReconcile(inventoryItemId: string, updatedAt: string) {
  const last = lastQueriedAt.get(inventoryItemId) ?? 0;
  const elapsed = Date.now() - last;

  if (elapsed >= DEBOUNCE_WINDOW_MS) {
    // Leading edge: nothing in-flight recently for this item -- query immediately.
    void reconcileOneItem(inventoryItemId, updatedAt);
    return;
  }

  // Inside the debounce window: don't query again now, but guarantee exactly one trailing check
  // fires right when the window ends, carrying the LATEST updatedAt seen so far.
  const existing = pendingTrailing.get(inventoryItemId);
  if (existing) {
    if (updatedAt > existing.latestUpdatedAt) existing.latestUpdatedAt = updatedAt;
    return; // a trailing check is already scheduled -- do not schedule a second one
  }

  const remaining = DEBOUNCE_WINDOW_MS - elapsed;
  const timer = setTimeout(() => {
    const pending = pendingTrailing.get(inventoryItemId);
    pendingTrailing.delete(inventoryItemId);
    void reconcileOneItem(inventoryItemId, pending?.latestUpdatedAt ?? updatedAt);
  }, remaining);
  pendingTrailing.set(inventoryItemId, { timer, latestUpdatedAt: updatedAt });
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
    //    happen inside scheduleOrRunReconcile/reconcileOneItem. Not awaited here -- a slow
    //    Shopify response must never risk Shopify's 5s delivery timeout.
    const inventoryItemGid = `gid://shopify/InventoryItem/${payload.inventory_item_id}`;
    scheduleOrRunReconcile(inventoryItemGid, payload.updated_at);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[inventory-webhook] Unhandled error:', err);
    // Still 200: a malformed payload we can't recover from shouldn't cause Shopify to keep
    // retrying it forever, or eventually disable the whole subscription because of it.
    return NextResponse.json({ ok: true, error: 'unhandled error, logged' }, { status: 200 });
  }
}
