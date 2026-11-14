import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { verifyShopifyHmac, WebhookIdDedup } from '@/lib/webhooks/verify';
import { draftStatusFromState, orderStatusFromState } from '@/lib/webhooks/order-status';

// HMAC verification needs Node's crypto.timingSafeEqual, not available on the edge runtime.
export const runtime = 'nodejs';

const webhookDedup = new WebhookIdDedup();
const DRAFT_TOPICS = ['draft_orders/create', 'draft_orders/update', 'draft_orders/delete'];
const ORDER_TOPICS = ['orders/create', 'orders/updated', 'orders/cancelled', 'orders/fulfilled', 'orders/partially_fulfilled'];
const VALID_TOPICS = [...DRAFT_TOPICS, ...ORDER_TOPICS];

function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type OrdersWebhookPayload = {
  id: number;
  customer?: { id: number } | null;
  status?: string; // draft orders: 'open' | 'invoice_sent' | 'completed'
  financial_status?: string | null; // real orders: 'paid' | 'pending' | 'refunded' | ...
  fulfillment_status?: string | null; // real orders: 'fulfilled' | 'partial' | null
  cancelled_at?: string | null;
  updated_at?: string; // absent on draft_orders/delete, whose payload is just { id }
};

/** Throws on any database error, so the caller answers 5xx and Shopify redelivers. */
async function logStatusChange(topic: string, payload: OrdersWebhookPayload) {
  const supabase = getServiceRoleClient();
  const isDraftOrder = DRAFT_TOPICS.includes(topic);
  const orderId = `gid://shopify/${isDraftOrder ? 'DraftOrder' : 'Order'}/${payload.id}`;
  const newStatus = isDraftOrder
    ? draftStatusFromState(topic === 'draft_orders/delete' ? null : payload)
    : orderStatusFromState({
        cancelledAt: payload.cancelled_at,
        financialStatus: payload.financial_status,
        fulfillmentStatus: payload.fulfillment_status,
      });

  let customerId = payload.customer ? `gid://shopify/Customer/${payload.customer.id}` : null;
  if (!customerId && topic === 'draft_orders/delete') {
    // The delete payload carries no customer -- reuse the one already logged for this draft so the
    // "deleted" row still shows up under that customer in the admin drawer.
    const { data, error } = await supabase
      .from('order_status_log')
      .select('customer_id')
      .eq('order_id', orderId)
      .not('customer_id', 'is', null)
      .limit(1);
    if (error) throw error;
    customerId = data?.[0]?.customer_id ?? null;
  }

  const { error } = await supabase.rpc('log_order_status_change_if_new', {
    p_order_id: orderId,
    p_customer_id: customerId,
    p_new_status: newStatus,
    p_changed_at: payload.updated_at ?? new Date().toISOString(),
  });
  if (error) throw error;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Raw body FIRST -- HMAC verification needs the exact bytes Shopify signed.
    const rawBody = await request.text();

    // 2. HMAC verification before any parsing -- the trust boundary for this entire route.
    const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
    if (!(await verifyShopifyHmac(rawBody, hmacHeader))) {
      return NextResponse.json({ error: 'HMAC verification failed' }, { status: 401 });
    }

    // 3. Cheap header sanity checks.
    const topic = request.headers.get('X-Shopify-Topic');
    const shopDomain = request.headers.get('X-Shopify-Shop-Domain');
    if (!topic || !VALID_TOPICS.includes(topic)) {
      return NextResponse.json({ ok: true, ignored: 'unexpected topic' }, { status: 200 });
    }
    if (shopDomain !== process.env.SHOPIFY_STORE_DOMAIN) {
      return NextResponse.json({ ok: true, ignored: 'unexpected shop domain' }, { status: 200 });
    }

    // 4. True-duplicate-delivery dedup (Shopify's own retries). Only checked here -- the id is
    // recorded after the write succeeds, so a failed attempt is still processed on retry.
    const webhookId = request.headers.get('X-Shopify-Webhook-Id');
    if (webhookDedup.hasSeen(webhookId)) {
      return NextResponse.json({ ok: true, ignored: 'duplicate delivery' }, { status: 200 });
    }

    let payload: OrdersWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as OrdersWebhookPayload;
    } catch {
      // Signed by Shopify but not JSON -- a retry would carry the same bytes, so don't ask for one.
      console.error('[orders-webhook] unparseable payload for topic', topic);
      return NextResponse.json({ ok: true, ignored: 'unparseable payload' }, { status: 200 });
    }

    // Awaited: on Vercel a function can be frozen once the response is sent, so un-awaited work
    // may never run. One RPC is well inside Shopify's 5s delivery timeout.
    await logStatusChange(topic, payload);
    webhookDedup.markSeen(webhookId);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    // 5xx so Shopify redelivers (it retries with backoff for ~4h). Answering 200 here would
    // drop the event for good.
    console.error('[orders-webhook] processing failed:', err);
    return NextResponse.json({ ok: false, error: 'processing failed, please retry' }, { status: 500 });
  }
}
