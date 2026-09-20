/**
 * One-time rename of the load-test products already created (those in .loadtest-manifest.json):
 * "Geek Bar Pulse 2 - 4pc/Ctn - Federal (Batch 5)" -> "5Geek Bar Pulse 2 - 4pc/Ctn - Federal", i.e. the
 * clone number becomes a prefix (clone 0 -> "1...") instead of a "(Batch N)" suffix, so repeated
 * products no longer share an identical name. Only products listed in the manifest are touched.
 * Idempotent: a product whose title already equals the target is skipped.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/rename-loadtest-titles.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const manifest = JSON.parse(readFileSync(join(__dirname, '.loadtest-manifest.json'), 'utf-8')) as {
  entries: Array<{ productId: string; cloneIndex: number }>;
};

const GET = /* GraphQL */ `query($id: ID!) { product(id: $id) { title } }`;
const UPDATE = /* GraphQL */ `
  mutation($product: ProductUpdateInput!) {
    productUpdate(product: $product) { product { id } userErrors { field message } }
  }
`;

async function retry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let a = 1; ; a++) {
    try { return await fn(); }
    catch (e) {
      if (a >= 10) throw e;
      await new Promise((r) => setTimeout(r, 1500 * a));
    }
  }
}

async function main() {
  let renamed = 0, skipped = 0, missing = 0;
  for (const [i, e] of manifest.entries.entries()) {
    const data = await retry(() => shopifyAdminRequest<any>(GET, { id: e.productId }), 'get');
    if (!data.product) { missing++; continue; }
    const base = (data.product.title as string).replace(/^\d+(?=\D)/, '').replace(/ \(Batch \d+\)$/, '');
    const target = `${e.cloneIndex + 1}${base}`;
    if (data.product.title === target) { skipped++; continue; }
    const res = await retry(() => shopifyAdminRequest<any>(UPDATE, { product: { id: e.productId, title: target } }), 'update');
    if (res.productUpdate.userErrors?.length) throw new Error(JSON.stringify(res.productUpdate.userErrors));
    renamed++;
    if (renamed % 25 === 0) console.log(`  ${renamed} renamed (${i + 1}/${manifest.entries.length} checked) e.g. ${target}`);
  }
  console.log(`\nDone. renamed=${renamed} already-ok=${skipped} not-found=${missing} of ${manifest.entries.length}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
