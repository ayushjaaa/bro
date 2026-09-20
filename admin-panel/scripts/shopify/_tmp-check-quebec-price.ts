import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const QUERY = /* GraphQL */ `
  query {
    products(first: 15, query: "title:*lets crea*") {
      nodes {
        id
        title
        variants(first: 20) {
          nodes {
            id
            title
            price
            retail: metafield(namespace: "custom", key: "retail_price") { value }
          }
        }
      }
    }
  }
`;

async function main() {
  const data = await shopifyAdminRequest<any>(QUERY);
  console.log(JSON.stringify(data, null, 2));
}
main();
