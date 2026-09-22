/**
 * Backfill -- sets `custom.retail_price` (money) = wholesale price x 1.25 on every variant of every
 * product tagged `loadtest` that doesn't have one yet. The load-test seed never set it, so retail and
 * wholesale customers saw identical prices on those products (resolvePrice falls back to the wholesale
 * price when retail_price is empty). Idempotent: variants that already have a retail_price are skipped.
 * Only touches `loadtest` products.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/backfill-loadtest-retail-price.ts
 */
import { shopifyAdminRequest, assertNoUserErrors, ShopifyAdminApiError } from '../../src/lib/shopify/admin-client.core';

const MARKUP = 1.25;
const BATCH = 25; // metafieldsSet accepts at most 25 metafields per call

async function withRetry<T>(fn: () => Promise<T>, label: string, attempt = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (attempt <= 12) {
      const backoffMs = 2000 * Math.min(attempt, 5);
      const why = err instanceof ShopifyAdminApiError ? JSON.stringify(err.errors).slice(0, 80) : String(err).slice(0, 80);
      console.log(`    retry ${label} in ${backoffMs}ms (attempt ${attempt}): ${why}`);
      await new Promise((r) => setTimeout(r, backoffMs));
      return withRetry(fn, label, attempt + 1);
    }
    throw err;
  }
}

const LIST = /* GraphQL */ `
  query ($after: String) {
    products(query: "tag:loadtest", first: 20, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { variants(first: 100) { nodes { id price retail: metafield(namespace: "custom", key: "retail_price") { value } } } }
    }
  }
`;
const SET = /* GraphQL */ `
  mutation ($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { userErrors { field message } }
  }
`;

async function main() {
  const shop = await shopifyAdminRequest<{ shop: { currencyCode: string } }>('{ shop { currencyCode } }');
  const currency = shop.shop.currencyCode;
  let after: string | null = null;
  let pending: Array<{ ownerId: string; namespace: string; key: string; type: string; value: string }> = [];
  let written = 0, skipped = 0, pages = 0;

  const flush = async () => {
    while (pending.length > 0) {
      const chunk = pending.splice(0, BATCH);
      const res = await withRetry(() => shopifyAdminRequest<{ metafieldsSet: { userErrors: Array<{ message: string }> } }>(SET, { metafields: chunk }), 'metafieldsSet');
      assertNoUserErrors(res.metafieldsSet.userErrors, 'metafieldsSet');
      written += chunk.length;
      await new Promise((r) => setTimeout(r, 250));
    }
    console.log(`  written ${written}, skipped (already set) ${skipped}, product pages ${pages}`);
  };

  do {
    const d: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Array<{ variants: { nodes: Array<{ id: string; price: string; retail: { value: string } | null }> } }> } } =
      await withRetry(() => shopifyAdminRequest(LIST, { after }), 'list');
    pages++;
    for (const p of d.products.nodes) {
      for (const v of p.variants.nodes) {
        if (v.retail) { skipped++; continue; }
        const retail = (Math.round(Number(v.price) * MARKUP * 100) / 100).toFixed(2);
        pending.push({ ownerId: v.id, namespace: 'custom', key: 'retail_price', type: 'money', value: JSON.stringify({ amount: retail, currency_code: currency }) });
      }
    }
    if (pending.length >= 500) await flush();
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
  await flush();
  console.log(`DONE: ${written} variants got a retail price, ${skipped} already had one.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
