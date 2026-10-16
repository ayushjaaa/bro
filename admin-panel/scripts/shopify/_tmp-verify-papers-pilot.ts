import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = `query($id: ID!) { product(id: $id) { title productType vendor tags metafields(first:10, namespace:"custom") { nodes { key value } } variants(first:5) { nodes { title price } } } }`;
async function main() {
  const data = await shopifyAdminRequest<any>(Q, { id: 'gid://shopify/Product/9098454335686' });
  console.log(JSON.stringify(data, null, 2));
}
main().catch(e=>{console.error(e);process.exit(1)});
