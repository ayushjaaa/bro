import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { writeFileSync } from 'fs';
// Read-only: dump every product (handle, type, status, tags, vendor, variant SKUs + stock) to JSON.
async function main() {
  const out: any[] = []; let after: string | null = null;
  do {
    const r: any = await shopifyAdminRequest<any>(`query($a:String){products(first:100,after:$a){pageInfo{hasNextPage endCursor}
      nodes{handle title productType status vendor tags totalInventory
        brand: metafield(namespace:"custom",key:"brand"){value}
        variants(first:100){nodes{sku price inventoryQuantity selectedOptions{name value}}}}}}`, { a: after });
    out.push(...r.products.nodes);
    after = r.products.pageInfo.hasNextPage ? r.products.pageInfo.endCursor : null;
  } while (after);
  const shop: any = await shopifyAdminRequest<any>(`{ shop { myshopifyDomain } }`);
  writeFileSync(process.argv[2], JSON.stringify({ shop: shop.shop.myshopifyDomain, products: out }));
  console.log('shop', shop.shop.myshopifyDomain, 'products', out.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
