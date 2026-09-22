import { NextResponse, type NextRequest } from 'next/server';
import { createDraftOrder, type CreateDraftOrderResult, type CreateDraftOrderError } from '@/lib/shopify/draft-orders';
import { MAX_BODY_CHARS, parseCreateDraftOrderInput } from '@/lib/shopify/draft-order-input';
import { isInternalRequestAuthorized } from '@/lib/internal-auth';
import { OrderIdempotency, orderIdempotencyKey } from '@/lib/order-idempotency';

export const runtime = 'nodejs';

// O-1: a double-click / retried request for the same customer + cart contents gets back the SAME
// Draft Order instead of creating a second one. See lib/order-idempotency.ts for the exact rule.
const idempotency = new OrderIdempotency<CreateDraftOrderResult | CreateDraftOrderError>();

export async function POST(request: NextRequest) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Read as text first so an oversized body is refused before it is parsed.
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: 'request too large' }, { status: 413 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = parseCreateDraftOrderInput(raw);
  if (!parsed.ok) {
    // Which field was wrong goes to the log only, never back to the caller.
    console.error('[create-draft-order] rejected invalid payload:', parsed.issues);
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }

  const key = orderIdempotencyKey(parsed.data);
  // C2: createDraftOrder already catches its own known failure modes and returns {ok:false,...},
  // but an unexpected throw from the idempotency layer itself (or anything outside those known
  // try/catch blocks) must still hit this route's own JSON error contract, not a raw 500.
  let result: CreateDraftOrderResult | CreateDraftOrderError;
  try {
    result = await idempotency.run(key, () => createDraftOrder(parsed.data));
  } catch (err) {
    console.error('[create-draft-order] unexpected error:', err);
    return NextResponse.json({ error: 'Could not create order. Please try again.' }, { status: 502 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 422 });
  }

  return NextResponse.json({ draftOrderId: result.draftOrderId, name: result.name }, { status: 200 });
}
