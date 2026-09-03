import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const QUERY = /* GraphQL */ `
  query {
    shop {
      name
      currencyCode
      plan {
        displayName
        partnerDevelopment
      }
    }
  }
`;

async function main() {
  const data = await shopifyAdminRequest<any>(QUERY);
  console.log(JSON.stringify(data, null, 2));
}
main().catch((e) => console.error('FAILED:', e.message, e.errors));
