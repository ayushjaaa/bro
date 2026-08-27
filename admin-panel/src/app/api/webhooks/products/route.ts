import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { getProductTaxonomyAndFilters } from '@/lib/shopify/product-webhook-queries';
import { verifyShopifyHmac, WebhookIdDedup } from '@/lib/webhooks/verify';

// HMAC verification needs Node's crypto.timingSafeEqual, not available on the edge runtime.
export const runtime = 'nodejs';

const webhookDedup = new WebhookIdDedup();
const VALID_TOPICS = ['products/create', 'products/update', 'products/delete'];

type RestVariant = {
  id: number;
  sku: string | null;
  price: string;
  compare_at_price: string | null;
};

type RestProductPayload = {
  id: number;
  title: string;
  status: string; // lowercase in REST payloads (active/draft/archived) -- normalized before storage
  images: Array<{ id: number }>;
  variants: RestVariant[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function handleDelete(productGid: string) {
  const supabase = getServiceRoleClient();
  const { error } = await supabase.rpc('delete_product_health_snapshot', { p_product_id: productGid });
  if (error) console.error('[products-webhook] delete failed:', error);
}

async function handleCreateOrUpdate(payload: RestProductPayload) {
  const productGid = `gid://shopify/Product/${payload.id}`;

  // Reliable directly from the payload -- no re-query needed for these.
  const hasImage = payload.images.length > 0;
  const variantCount = payload.variants.length;
  const missingSkuCount = payload.variants.filter((v) => !v.sku || v.sku.trim() === '').length;
  const hasPriceAnomaly = payload.variants.some((v) => {
    const price = parseFloat(v.price);
    const compareAt = v.compare_at_price ? parseFloat(v.compare_at_price) : null;
    return price === 0 || (compareAt !== null && compareAt < price);
  });

  // Not reliable from the payload (metafields) -- re-query. Null means "Shopify query failed,"
  // in which case we still upsert everything else but leave taxonomy fields as null/false rather
  // than blocking the whole update (a later webhook or the backfill script will fill them in).
  const taxonomy = await getProductTaxonomyAndFilters(productGid);

  const supabase = getServiceRoleClient();
  const { error } = await supabase.rpc('upsert_product_health_snapshot_if_newer', {
    p_product_id: productGid,
    p_title: payload.title,
    p_status: payload.status.toUpperCase(),
    p_has_image: hasImage,
    p_variant_count: variantCount,
    p_missing_sku_count: missingSkuCount,
    p_has_price_anomaly: hasPriceAnomaly,
    p_brand_id: taxonomy?.brandId ?? null,
    p_brand_name: taxonomy?.brandName ?? null,
    p_subcategory_id: taxonomy?.subcategoryId ?? null,
    p_subcategory_name: taxonomy?.subcategoryName ?? null,
    p_missing_required_filter: taxonomy?.missingRequiredFilter ?? false,
    p_created_at: payload.created_at,
    p_published_at: payload.published_at,
    p_shopify_updated_at: payload.updated_at,
  });
  if (error) console.error('[products-webhook] upsert failed:', error);

  const skuRows = payload.variants
    .filter((v) => v.sku && v.sku.trim() !== '')
    .map((v) => ({ variant_id: `gid://shopify/ProductVariant/${v.id}`, sku: v.sku }));
  const { error: skuError } = await supabase.rpc('replace_variant_sku_index_for_product', {
    p_product_id: productGid,
    p_variants: skuRows,
  });
  if (skuError) console.error('[products-webhook] sku index update failed:', skuError);
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

    const payload = JSON.parse(rawBody);

    // Not awaited -- the taxonomy re-query + two Supabase writes must never risk Shopify's 5s
    // delivery timeout (same reasoning as the inventory route's fire-and-forget reconcile).
    if (topic === 'products/delete') {
      void handleDelete(`gid://shopify/Product/${payload.id}`);
    } else {
      void handleCreateOrUpdate(payload as RestProductPayload);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[products-webhook] Unhandled error:', err);
    // Still 200: a malformed payload we can't recover from shouldn't cause Shopify to keep
    // retrying it forever, or eventually disable the whole subscription because of it.
    return NextResponse.json({ ok: true, error: 'unhandled error, logged' }, { status: 200 });
  }
}
