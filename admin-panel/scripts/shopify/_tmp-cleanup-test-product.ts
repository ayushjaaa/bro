import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';
const MUTATION = /* GraphQL */ `mutation($id: ID!) { productDelete(input: { id: $id }) { deletedProductId userErrors { field message } } }`;
async function main() {
  const data = await shopifyAdminRequest<any>(MUTATION, { id: 'gid://shopify/Product/10435485073708' });
  assertNoUserErrors(data.productDelete.userErrors, 'productDelete');
  console.log('deleted:', data.productDelete.deletedProductId);
}
main().catch((e) => { console.error(e); process.exit(1); });
