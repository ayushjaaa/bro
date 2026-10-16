/**
 * Backfills the filter metafield that productCreate silently dropped for 207 products (value
 * wasn't in the choices list at creation time -- now fixed by _tmp-extend-filter-choices.ts, or a
 * plain case mismatch for eliquid_bottle_size). Re-derives the correct value from import_plan.json
 * (the same source the original import used) and writes it via metafieldsSet.
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-backfill-dropped-filters.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';

type PlanProduct = {
  handle: string;
  subcategory: string;
  filterValues: Record<string, string>;
};

const SET_MUTATION = `mutation($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { key value } userErrors { field message } }
}`;

const GET_MUTATION = `query($id: ID!) { product(id: $id) { metafields(first: 20, namespace: "custom") { nodes { key value } } } }`;

// eliquid_bottle_size's real gap was case only ("30mL" vs stored "30ml") -- normalize instead of
// touching the choices list for it.
function normalizeValue(key: string, value: string): string {
  if (key === 'eliquid_bottle_size') return value.toLowerCase();
  return value;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

async function main() {
  const plan: PlanProduct[] = JSON.parse(readFileSync('/Users/ayushjaiswal/Downloads/import_plan.json', 'utf-8'));
  const handleToGid: Record<string, string> = JSON.parse(
    readFileSync('/Users/ayushjaiswal/Downloads/handle_to_gid.json', 'utf-8')
  );

  let ok = 0, skip = 0, fail = 0;
  for (const p of plan) {
    const productId = handleToGid[p.handle];
    if (!productId || Object.keys(p.filterValues).length === 0) { skip++; continue; }

    try {
      const existing = await withRetry(() => shopifyAdminRequest<any>(GET_MUTATION, { id: productId }));
      const existingKeys = new Set(existing.product.metafields.nodes.map((n: any) => n.key));
      const missing = Object.entries(p.filterValues).filter(([key]) => !existingKeys.has(key));
      if (missing.length === 0) { skip++; continue; }

      const metafields = missing.map(([key, value]) => ({
        ownerId: productId,
        namespace: 'custom',
        key,
        type: 'single_line_text_field',
        value: normalizeValue(key, value),
      }));
      const res = await withRetry(() => shopifyAdminRequest<any>(SET_MUTATION, { metafields }));
      const errs = res.metafieldsSet.userErrors;
      if (errs?.length) {
        fail++;
        console.log(`FAIL ${p.handle}: ${JSON.stringify(errs)}`);
      } else {
        ok++;
        console.log(`OK   ${p.handle}: backfilled ${missing.map(([k]) => k).join(', ')}`);
      }
    } catch (e: any) {
      fail++;
      console.log(`FAIL ${p.handle}: ${e?.message || e}`);
    }
  }
  console.log(`\nDone. ${ok} backfilled, ${skip} skipped (nothing missing), ${fail} failed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
