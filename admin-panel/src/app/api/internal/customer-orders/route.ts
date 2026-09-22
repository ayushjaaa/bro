import { NextResponse, type NextRequest } from 'next/server';
import { getShopifyCustomerIdForCustomer } from '@/data/customer-shopify-id';
import { listDraftOrdersForShopifyCustomer } from '@/lib/shopify/customer-orders';
import { isInternalRequestAuthorized, MAX_INTERNAL_JSON_BODY_CHARS } from '@/lib/internal-auth';

// timingSafeEqual (inside isInternalRequestAuthorized) needs Node's crypto, not available on the
// edge runtime.
export const runtime = 'nodejs';

const SECRET_ENV = 'INTERNAL_ORDER_HISTORY_SECRET';

/**
 * Trusted internal endpoint -- called only by storefront's account page, never by Shopify or a
 * browser directly. Same shared-secret pattern as /api/internal/create-draft-order (see that
 * route's own doc comment): the storefront app must never hold Admin API credentials, so it asks
 * admin-panel to resolve and query Shopify on its behalf.
 *
 * W-1: uses its OWN secret (`INTERNAL_ORDER_HISTORY_SECRET`), not the draft-order one -- this
 * route returns a customer's order history (PII: line items, eventually contact/address once
 * resolved by customer-order-detail), a different and broader exposure than "can create a draft
 * order," so a leak of one must not grant the other. Shared with customer-order-detail (same
 * purpose, same sensitivity), same reasoning as delete-applicant's own separate secret.
 *
 * Takes this app's own Supabase `customerId` (never a Shopify Customer GID -- the storefront never
 * sees or sends one) and resolves it to `shopify_customer_id` itself, server-side, before querying
 * Shopify -- see `getShopifyCustomerIdForCustomer`'s own doc comment for why that resolution lives
 * here rather than being threaded through from the caller.
 */
export async function POST(request: NextRequest) {
  if (!isInternalRequestAuthorized(request, SECRET_ENV)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const text = await request.text();
  if (text.length > MAX_INTERNAL_JSON_BODY_CHARS) {
    return NextResponse.json({ error: 'request too large' }, { status: 413 });
  }

  let body: { customerId?: string; from?: string; to?: string };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.customerId) {
    return NextResponse.json({ error: 'missing required field: customerId' }, { status: 400 });
  }

  try {
    const shopifyCustomerId = await getShopifyCustomerIdForCustomer(body.customerId);
    if (!shopifyCustomerId) {
      // Not an error -- a customer with no Shopify link yet simply has no orders to show.
      return NextResponse.json({ orders: [] }, { status: 200 });
    }

    const orders = await listDraftOrdersForShopifyCustomer(shopifyCustomerId, { from: body.from, to: body.to });
    return NextResponse.json({ orders }, { status: 200 });
  } catch (err) {
    console.error('[internal-customer-orders] lookup failed:', err);
    return NextResponse.json({ error: 'Could not load orders' }, { status: 502 });
  }
}
