import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = /* GraphQL */ `query($id: ID!) {
  product(id: $id) {
    title
    status
    media(first: 5) { nodes { ... on MediaImage { status } } }
    variants(first: 5) { nodes { price } }
    publishedOnCurrentPublication
  }
}`;
async function main() {
  const data = await shopifyAdminRequest<any>(Q, { id: 'gid://shopify/Product/9093229609158' });
  console.log(JSON.stringify(data, null, 2));
}
main().catch(e=>{console.error(e); if(e?.errors) console.error(JSON.stringify(e.errors,null,2)); process.exit(1);});
