import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
// Read-only: show a product's type + collections, and an already-live beaker bong for comparison.
async function main() {
  for (const h of process.argv.slice(2)) {
    const r: any = await shopifyAdminRequest<any>(`query($h:String!){productByHandle(handle:$h){productType createdAt collections(first:10){nodes{title}}}}`, { h });
    console.log(h, JSON.stringify(r.productByHandle));
  }
}
main();
