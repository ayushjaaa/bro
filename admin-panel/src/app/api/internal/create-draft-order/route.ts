import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createDraftOrder, type CreateDraftOrderInput } from '@/lib/shopify/draft-orders';

// timingSafeEqual needs Node's crypto, not available on the edge runtime.
export const runtime = 'nodejs';

/**
 * Trusted internal endpoint -- called only by storefront's checkout "Place Order" action, never
 * by Shopify or a browser directly. Exists because draftOrderCreate is Admin-API-only (confirmed
 * multiple independent ways it doesn't exist anywhere in the Storefront API), and the storefront
 * app must never hold Admin API credentials -- same shared-secret pattern as storefront's own
 * /api/internal/revalidate-product (see that file's doc comment), just the reverse direction.
 *
 * No requireAdmin() here deliberately -- this request has no admin session at all (a real
 * customer's checkout, not a logged-in admin), same reasoning as the inventory webhook route's own
 * doc comment on why it skips requireAdmin() too. The shared secret IS the trust boundary.
 */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_DRAFT_ORDER_SECRET;
  if (!expected) {
    console.error('[internal-create-draft-order] INTERNAL_DRAFT_ORDER_SECRET not set -- refusing all requests');
    return false;
  }
  const provided = request.headers.get('X-Internal-Secret');
  if (!provided) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: CreateDraftOrderInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body.lineItems || body.lineItems.length === 0 || !body.email || !body.fulfillmentMethod || !body.customerId) {
    return NextResponse.json(
      { error: 'missing required fields: lineItems, email, fulfillmentMethod, customerId' },
      { status: 400 }
    );
  }

  const result = await createDraftOrder(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ draftOrderId: result.draftOrderId, name: result.name }, { status: 200 });
}
