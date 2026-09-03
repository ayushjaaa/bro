import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const QUERY = /* GraphQL */ `
  query {
    locations(first: 10) {
      nodes {
        id
        name
        isActive
        fulfillsOnlineOrders
        shipsInventory
        address {
          address1
          city
          province
          zip
          country
        }
      }
    }
  }
`;

async function main() {
  const data = await shopifyAdminRequest<any>(QUERY);
  console.log(JSON.stringify(data, null, 2));
}
main().catch((e) => console.error('FAILED:', e.message, e.errors));
