/**
 * Makes each Federal load-test Disposable Vape show its own filter values so a human can verify
 * filters by eye: appends " [40000 puffs | 35mg | Salt | Rechargeable | 5-Pack]" to the title (visible
 * on listing cards) and writes the full values into the description (visible on the product page).
 * Idempotent: an existing " [...]" suffix is replaced, "-" marks an empty value.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/label-filter-values.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  for (let a = 1; ; a++) {
    try { return await fn(); } catch (e) { if (a >= 12) throw e; await new Promise((r) => setTimeout(r, 1500 * a)); }
  }
}
const gql = (q: string, v?: any) => retry(() => shopifyAdminRequest<any>(q, v));

const LIST = `query($after: String) { products(query: "tag:loadtest AND tag:region-federal AND product_type:\\"Standard Disposable Vapes\\"", first: 50, after: $after, sortKey: ID) { pageInfo { hasNextPage endCursor } nodes { id title descriptionHtml
  puff: metafield(namespace:"custom", key:"disposable_vape_puff_count"){value} nic: metafield(namespace:"custom", key:"disposable_vape_nicotine_strength"){value} type: metafield(namespace:"custom", key:"disposable_vape_nicotine_type"){value} dev: metafield(namespace:"custom", key:"disposable_vape_device_type"){value} pack: metafield(namespace:"custom", key:"disposable_vape_pack_quantity"){value} } } }`;
const UPDATE = `mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { userErrors { message } } }`;

const SHORT_TYPE: Record<string, string> = { Freebase: 'Freebase', 'Nicotine Salt': 'Salt', 'Nicotine-Free': 'Nic-Free' };
const SHORT_DEV: Record<string, string> = { 'Standard Disposable': 'Standard', 'Rechargeable Disposable': 'Rechargeable', 'Mesh Coil': 'Mesh Coil' };

async function main() {
  let after: string | undefined;
  let done = 0, skipped = 0;
  for (;;) {
    const d = await gql(LIST, { after });
    for (const n of d.products.nodes) {
      const puff = n.puff?.value, nic = n.nic?.value, type = n.type?.value, dev = n.dev?.value, pack = n.pack?.value;
      const tag = `[${puff ? puff + ' puffs' : '-'} | ${nic ?? '-'} | ${type ? SHORT_TYPE[type] ?? type : '-'} | ${dev ? SHORT_DEV[dev] ?? dev : '-'} | ${pack ?? '-'}]`;
      const baseTitle = (n.title as string).replace(/ \[[^\]]*\]$/, '');
      const title = `${baseTitle} ${tag}`;
      const html =
        `<p><strong>Filter values (test data)</strong></p><ul>` +
        `<li>Puff Count: ${puff ?? '(none)'}</li><li>Nicotine Strength: ${nic ?? '(none)'}</li><li>Nicotine Type: ${type ?? '(none)'}</li>` +
        `<li>Device Type: ${dev ?? '(none)'}</li><li>Pack Quantity: ${pack ?? '(none)'}</li></ul>`;
      if (n.title === title && n.descriptionHtml === html) { skipped++; continue; }
      const r = await gql(UPDATE, { p: { id: n.id, title, descriptionHtml: html } });
      if (r.productUpdate.userErrors.length) throw new Error(JSON.stringify(r.productUpdate.userErrors));
      done++;
      if (done % 50 === 0) console.log(`  ${done} updated, e.g. ${title}`);
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }
  console.log(`Done. updated=${done} unchanged=${skipped}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
