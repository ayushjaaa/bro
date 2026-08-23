import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const MUTATION = /* GraphQL */ `
  mutation MetaobjectDelete($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }
`;

async function main() {
  const data = await shopifyAdminRequest<any>(MUTATION, { id: 'gid://shopify/Metaobject/273194778924' });
  assertNoUserErrors(data.metaobjectDelete.userErrors, 'metaobjectDelete');
  console.log('deleted:', data.metaobjectDelete.deletedId);
}
main().catch((e) => { console.error(e); process.exit(1); });
