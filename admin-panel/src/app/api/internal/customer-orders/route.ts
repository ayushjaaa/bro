import { NextResponse, type NextRequest } from 'next/server';
import { getShopifyCustomerIdForCustomer } from '@/data/customer-shopify-id';
import { listDraftOrdersForShopifyCustomer } from '@/lib/shopify/customer-orders';
import { isInternalRequestAuthorized } from '@/lib/internal-auth';

// timingSafeEqual (inside isInternalRequestAuthorized) needs Node's crypto, not available on the
// edge runtime.
export const runtime = 'nodejs';

/**
 * Trusted internal endpoint -- called only by storefront's account page, never by Shopify or a
 * browser directly. Same shared-secret pattern as /api/internal/create-draft-order (see that
 * route's own doc comment): the storefront app must never hold Admin API credentials, so it asks
 * admin-panel to resolve and query Shopify on its behalf.
 *
 * Takes this app's own Supabase `customerId` (never a Shopify Customer GID -- the storefront never
 * sees or sends one) and resolves it to `shopify_customer_id` itself, server-side, before querying
 * Shopify -- see `getShopifyCustomerIdForCustomer`'s own doc comment for why that resolution lives
 * here rather than being threaded through from the caller.
 */
export async function POST(request: NextRequest) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { customerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.customerId) {
    return NextResponse.json({ error: 'missing required field: customerId' }, { status: 400 });
  }

  const shopifyCustomerId = await getShopifyCustomerIdForCustomer(body.customerId);
  if (!shopifyCustomerId) {
    // Not an error -- a customer with no Shopify link yet simply has no orders to show.
    return NextResponse.json({ orders: [] }, { status: 200 });
  }

  try {
    const orders = await listDraftOrdersForShopifyCustomer(shopifyCustomerId);
    return NextResponse.json({ orders }, { status: 200 });
  } catch (err) {
    console.error('[internal-customer-orders] lookup failed:', err);
    return NextResponse.json({ error: 'Could not load orders' }, { status: 502 });
  }
}
