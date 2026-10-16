import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = /* GraphQL */ `query($id: ID!) {
  product(id: $id) {
    title productType vendor tags
    metafields(first: 10, namespace: "custom") { nodes { key value } }
    brandMf: metafield(namespace: "taxonomy", key: "brand") { reference { ... on Metaobject { id fields { key value } } } }
    variants(first: 5) { nodes { title price sku: sku inventoryQuantity } }
  }
}`;
async function main() {
  const data = await shopifyAdminRequest<any>(Q, { id: 'gid://shopify/Product/9093229609158' });
  console.log(JSON.stringify(data, null, 2));
}
main().catch(e=>{console.error(e);process.exit(1)});
