import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';
// Adds the client's new colours (SKU v2 file) to live products. Idempotent: a SKU already on the product is skipped.
const LOCATION_ID = 'gid://shopify/Location/84994621638';
async function main() {
  const items = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
  for (const it of items) {
    const r = await shopifyAdminRequest<any>(`query($h:String!){productByHandle(handle:$h){id options{name} variants(first:100){nodes{sku}}}}`, { h: it.handle });
    const p = r.productByHandle;
    if (p.variants.nodes.some((v: any) => v.sku === it.sku)) { console.log('skip (exists)', it.handle, it.option); continue; }
    const input: any = { optionValues: [{ optionName: p.options[0].name, name: it.option }], price: it.price,
      inventoryItem: { sku: it.sku, tracked: true }, inventoryQuantities: [{ availableQuantity: it.qty, locationId: LOCATION_ID }], inventoryPolicy: 'DENY' };
    const media = it.image ? [{ originalSource: it.image, mediaContentType: 'IMAGE', alt: it.option }] : undefined;
    if (it.image) input.mediaSrc = [it.image];
    const u = await shopifyAdminRequest<any>(`mutation($pid:ID!,$v:[ProductVariantsBulkInput!]!,$m:[CreateMediaInput!]){productVariantsBulkCreate(productId:$pid,variants:$v,media:$m){productVariants{id sku} userErrors{field message}}}`,
      { pid: p.id, v: [input], m: media });
    if (u.productVariantsBulkCreate.userErrors.length) { console.log('FAILED', it.handle, it.option, JSON.stringify(u.productVariantsBulkCreate.userErrors)); continue; }
    console.log('added', it.handle, it.option, it.sku);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
