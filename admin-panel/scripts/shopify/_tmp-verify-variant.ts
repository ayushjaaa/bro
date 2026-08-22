import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const PRODUCT_ID = 'gid://shopify/Product/10434658140460';

const QUERY = /* GraphQL */ `
  query {
    product(id: "${PRODUCT_ID}") {
      variantsCount { count }
      variants(first: 3) {
        nodes {
          id
          title
          price
          region: metafield(namespace: "custom", key: "region") { value }
          description: metafield(namespace: "custom", key: "flavour_description") { value }
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
