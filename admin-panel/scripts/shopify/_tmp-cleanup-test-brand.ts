import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';
const DELETE = /* GraphQL */ `mutation($id: ID!) { metaobjectDelete(id: $id) { deletedId userErrors { field message } } }`;
async function main() {
  const data = await shopifyAdminRequest<any>(DELETE, { id: 'gid://shopify/Metaobject/273195073836' });
  assertNoUserErrors(data.metaobjectDelete.userErrors, 'metaobjectDelete');
  console.log('deleted:', data.metaobjectDelete.deletedId);
}
main().catch((e) => { console.error(e); process.exit(1); });
