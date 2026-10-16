import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = /* GraphQL */ `query($id: ID!) { product(id: $id) { title media(first: 3) { nodes { ... on MediaImage { image { url } status } } } } }`;
async function main() {
  for (const id of [
    'gid://shopify/Product/9093229609158',
    'gid://shopify/Product/9093244092614',
  ]) {
    const data = await shopifyAdminRequest<any>(Q, { id });
    console.log(data.product.title, '->', JSON.stringify(data.product.media.nodes));
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
