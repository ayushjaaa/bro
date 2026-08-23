import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const QUERY = /* GraphQL */ `
  query ListMetaobjects($type: String!) {
    metaobjects(type: $type, first: 250) {
      nodes {
        id
        handle
        fields { key value reference { ... on Metaobject { id } } }
      }
    }
  }
`;

async function main() {
  for (const type of ['category', 'sub_category', 'brand']) {
    const data = await shopifyAdminRequest<any>(QUERY, { type });
    console.log(`\n=== ${type} (${data.metaobjects.nodes.length}) ===`);
    console.log(JSON.stringify(data.metaobjects.nodes, null, 2));
  }
}
main();
