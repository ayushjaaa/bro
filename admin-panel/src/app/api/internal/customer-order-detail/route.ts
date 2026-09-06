import { NextResponse, type NextRequest } from 'next/server';
import { getShopifyCustomerIdForCustomer } from '@/data/customer-shopify-id';
import { getDraftOrderDetail } from '@/lib/shopify/customer-orders';
import { isInternalRequestAuthorized } from '@/lib/internal-auth';

// timingSafeEqual (inside isInternalRequestAuthorized) needs Node's crypto, not available on the
// edge runtime.
export const runtime = 'nodejs';

/**
 * Trusted internal endpoint -- same shared-secret pattern as the other /api/internal/* routes.
 * Takes this app's own Supabase `customerId` (never a Shopify Customer GID) plus the Draft Order
 * GID the customer clicked in their order history, and returns that order's full detail ONLY if
 * `getDraftOrderDetail` confirms it actually belongs to them -- a 404 here covers both "no such
 * order" and "that's not your order" identically, on purpose (see that function's own doc comment
 * on why those two cases must never be distinguishable to the caller).
 */
export async function POST(request: NextRequest) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { customerId?: string; orderId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.customerId || !body.orderId) {
    return NextResponse.json({ error: 'missing required fields: customerId, orderId' }, { status: 400 });
  }

  const shopifyCustomerId = await getShopifyCustomerIdForCustomer(body.customerId);
  if (!shopifyCustomerId) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  try {
    const order = await getDraftOrderDetail(body.orderId, shopifyCustomerId);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    return NextResponse.json({ order }, { status: 200 });
  } catch (err) {
    console.error('[internal-customer-order-detail] lookup failed:', err);
    return NextResponse.json({ error: 'Could not load order' }, { status: 502 });
  }
}
