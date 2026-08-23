import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const QUERY = /* GraphQL */ `query { metaobjects(type: "brand", first: 50) { nodes { id fields { key value } } } }`;
async function main() {
  const data = await shopifyAdminRequest<any>(QUERY);
  console.log(JSON.stringify(data.metaobjects.nodes, null, 2));
}
main();
