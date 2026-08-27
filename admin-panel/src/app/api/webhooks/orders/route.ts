import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { verifyShopifyHmac, WebhookIdDedup } from '@/lib/webhooks/verify';

// HMAC verification needs Node's crypto.timingSafeEqual, not available on the edge runtime.
export const runtime = 'nodejs';

const webhookDedup = new WebhookIdDedup();
const VALID_TOPICS = ['draft_orders/create', 'draft_orders/update', 'orders/create', 'orders/updated'];

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
  financial_status?: string; // real orders: 'paid' | 'pending' | 'refunded' | ...
  updated_at: string;
};

async function logStatusChange(topic: string, payload: OrdersWebhookPayload) {
  const customerId = payload.customer ? `gid://shopify/Customer/${payload.customer.id}` : null;
  const isDraftOrder = topic.startsWith('draft_orders/');
  const orderId = `gid://shopify/${isDraftOrder ? 'DraftOrder' : 'Order'}/${payload.id}`;
  const newStatus =
    topic === 'orders/create'
      ? 'order_created'
      : topic === 'orders/updated'
        ? `order_${payload.financial_status ?? 'updated'}`
        : (payload.status ?? 'unknown'); // draft_orders/create|update

  const supabase = getServiceRoleClient();
  const { error } = await supabase.rpc('log_order_status_change_if_new', {
    p_order_id: orderId,
    p_customer_id: customerId,
    p_new_status: newStatus,
    p_changed_at: payload.updated_at,
  });
  if (error) console.error('[orders-webhook] log failed:', error);
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

    // 4. True-duplicate-delivery dedup (Shopify's own retries).
    const webhookId = request.headers.get('X-Shopify-Webhook-Id');
    if (webhookDedup.isDuplicate(webhookId)) {
      return NextResponse.json({ ok: true, ignored: 'duplicate delivery' }, { status: 200 });
    }

    const payload = JSON.parse(rawBody) as OrdersWebhookPayload;

    // Not awaited -- must never risk Shopify's 5s delivery timeout.
    void logStatusChange(topic, payload);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[orders-webhook] Unhandled error:', err);
    return NextResponse.json({ ok: true, error: 'unhandled error, logged' }, { status: 200 });
  }
}
