import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
// Renames the per-section "Gemini Distribution" brand entries to "Unbranded" (client file, SKU v2) and sets the
// vendor text of the products that point at them. Only touches products whose taxonomy.brand is one of these entries.
// Idempotent. Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-unbrand-glass.ts [--only <brandId>]
const IDS = ['312931549382', '312932466886', '317673865414', '317673930950', '317673996486', '317674029254', '317674062022',
  '317675176134', '317675307206', '317675536582', '321189707974', '323089039558', '323200712902'].map((n) => `gid://shopify/Metaobject/${n}`);
const NEW = 'Unbranded';
async function main() {
  const oi = process.argv.indexOf('--only'); const only = oi >= 0 ? `gid://shopify/Metaobject/${process.argv[oi + 1]}` : null;
  const ids = only ? IDS.filter((i) => i === only) : IDS;
  for (const id of ids) {
    const r = await shopifyAdminRequest<any>(`mutation($id:ID!,$m:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$m){metaobject{name:field(key:"name"){value}} userErrors{field message}}}`,
      { id, m: { fields: [{ key: 'name', value: NEW }] } });
    if (r.metaobjectUpdate.userErrors.length) throw new Error(`${id}: ${JSON.stringify(r.metaobjectUpdate.userErrors)}`);
  }
  console.log(`renamed ${ids.length} brand entries to "${NEW}"`);
  let after: string | null = null; let changed = 0, already = 0;
  do {
    const r: any = await shopifyAdminRequest<any>(`query($a:String){products(first:250,after:$a){pageInfo{hasNextPage endCursor} nodes{id handle vendor brand:metafield(namespace:"taxonomy",key:"brand"){value}}}}`, { a: after });
    for (const p of r.products.nodes) {
      if (!ids.includes(p.brand?.value)) continue;
      if (p.vendor === NEW) { already++; continue; }
      const u = await shopifyAdminRequest<any>(`mutation($i:ProductUpdateInput!){productUpdate(product:$i){userErrors{field message}}}`, { i: { id: p.id, vendor: NEW } });
      if (u.productUpdate.userErrors.length) { console.log('FAILED', p.handle, JSON.stringify(u.productUpdate.userErrors)); continue; }
      changed++;
    }
    after = r.products.pageInfo.hasNextPage ? r.products.pageInfo.endCursor : null;
  } while (after);
  console.log(`vendor set on ${changed} products (${already} already "${NEW}")`);
}
main().catch((e) => { console.error(e); process.exit(1); });
