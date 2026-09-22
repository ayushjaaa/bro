import { NextResponse, type NextRequest } from 'next/server';
import { getShopifyCustomerIdForCustomer, getCustomerOrderContactInfo } from '@/data/customer-shopify-id';
import { getDraftOrderDetail } from '@/lib/shopify/customer-orders';
import { isInternalRequestAuthorized, MAX_INTERNAL_JSON_BODY_CHARS } from '@/lib/internal-auth';

// timingSafeEqual (inside isInternalRequestAuthorized) needs Node's crypto, not available on the
// edge runtime.
export const runtime = 'nodejs';

const SECRET_ENV = 'INTERNAL_ORDER_HISTORY_SECRET';

/**
 * Trusted internal endpoint -- same shared-secret pattern as the other /api/internal/* routes.
 *
 * W-1: uses its OWN secret (`INTERNAL_ORDER_HISTORY_SECRET`, shared with customer-orders, not
 * with create-draft-order) -- this route returns a customer's full name/email/phone/address on
 * top of order line items, so a leak of the draft-order secret must not also expose this.
 *
 * Takes this app's own Supabase `customerId` (never a Shopify Customer GID) plus the Draft Order
 * GID the customer clicked in their order history, and returns that order's full detail ONLY if
 * `getDraftOrderDetail` confirms it actually belongs to them -- a 404 here covers both "no such
 * order" and "that's not your order" identically, on purpose (see that function's own doc comment
 * on why those two cases must never be distinguishable to the caller).
 */
export async function POST(request: NextRequest) {
  if (!isInternalRequestAuthorized(request, SECRET_ENV)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const text = await request.text();
  if (text.length > MAX_INTERNAL_JSON_BODY_CHARS) {
    return NextResponse.json({ error: 'request too large' }, { status: 413 });
  }

  let body: { customerId?: string; orderId?: string };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.customerId || !body.orderId) {
    return NextResponse.json({ error: 'missing required fields: customerId, orderId' }, { status: 400 });
  }

  try {
    const shopifyCustomerId = await getShopifyCustomerIdForCustomer(body.customerId);
    if (!shopifyCustomerId) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = await getDraftOrderDetail(body.orderId, shopifyCustomerId);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Always fetched, not just when Shopify blocked something -- accountNumber is never a
    // Shopify field at all (purely this app's own identifier), and the invoice page
    // (storefront/src/app/invoice/page.tsx) needs it for every order to build a filename that's
    // actually unique per customer, not just per order name.
    const contact = await getCustomerOrderContactInfo(body.customerId);
    order.accountNumber = contact.accountNumber;

    // This store's Shopify plan blocks reading name/email/phone/precise-address back from the
    // Admin API (see getDraftOrderDetail's own doc comment) -- getDraftOrderDetail already
    // returns those specific fields as `null` rather than throwing. Backfill them from the same
    // Supabase row (the same data, collected directly from this customer at registration) so the
    // customer still sees their real name/contact/address, not a blank. city/province/country are
    // NOT blocked by Shopify's restriction, so those stay as Shopify returned them -- only the
    // specific blocked fields get overwritten here.
    order.customerName =
      order.customerName ?? ([contact.firstName, contact.lastName].filter(Boolean).join(' ') || null);
    order.email = order.email ?? contact.email;
    order.phone = order.phone ?? contact.phone;
    if (order.shippingAddress) {
      order.shippingAddress.address1 = order.shippingAddress.address1 ?? contact.shipLine1;
      order.shippingAddress.address2 = order.shippingAddress.address2 ?? contact.shipLine2;
      order.shippingAddress.zip = order.shippingAddress.zip ?? contact.shipPostalCode;
    }

    return NextResponse.json({ order }, { status: 200 });
  } catch (err) {
    console.error('[internal-customer-order-detail] lookup failed:', err);
    return NextResponse.json({ error: 'Could not load order' }, { status: 502 });
  }
}
