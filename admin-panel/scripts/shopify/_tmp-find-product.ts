import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const QUERY = /* GraphQL */ `
  query {
    products(first: 5, query: "title:'Test Beast Mode Max 2'") {
      nodes {
        id
        title
        options { id name values }
      }
    }
  }
`;

async function main() {
  const data = await shopifyAdminRequest<any>(QUERY);
  console.log(JSON.stringify(data, null, 2));
}
main();
