import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const MUTATION = /* GraphQL */ `
  mutation ProductCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product { id title }
      userErrors { field message }
    }
  }
`;

async function main() {
  // Deliberately NO metafields (no Brand reference) — test if "required: true" blocks this
  const data = await shopifyAdminRequest<any>(MUTATION, {
    product: { title: 'Test Product WITHOUT Brand metafield' },
  });
  console.log('userErrors:', JSON.stringify(data.productCreate.userErrors, null, 2));
  console.log('product:', JSON.stringify(data.productCreate.product, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
