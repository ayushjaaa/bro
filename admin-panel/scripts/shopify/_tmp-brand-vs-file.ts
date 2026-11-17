import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { writeFileSync } from 'fs';
// Read-only: dump handle -> {vendor, brand name, status} for every product (brand via taxonomy.brand reference).
async function main() {
  const out: any[] = []; let after: string | null = null;
  do {
    const r: any = await shopifyAdminRequest<any>(`query($a:String){products(first:250,after:$a){pageInfo{hasNextPage endCursor} nodes{handle vendor status productType
      brand:metafield(namespace:"taxonomy",key:"brand"){reference{... on Metaobject{id name:field(key:"name"){value}}}}}}}`, { a: after });
    out.push(...r.products.nodes.map((p: any) => ({ handle: p.handle, vendor: p.vendor, status: p.status, type: p.productType, brand: p.brand?.reference?.name?.value ?? null, brandId: p.brand?.reference?.id ?? null })));
    after = r.products.pageInfo.hasNextPage ? r.products.pageInfo.endCursor : null;
  } while (after);
  writeFileSync(process.argv[2], JSON.stringify(out)); console.log('products', out.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
