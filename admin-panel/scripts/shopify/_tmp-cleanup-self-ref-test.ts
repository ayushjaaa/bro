import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const DELETE_DEF = /* GraphQL */ `
  mutation($id: ID!) { metaobjectDefinitionDelete(id: $id) { deletedId userErrors { field message } } }
`;

async function main() {
  // Deleting the definition cascades and deletes all its entries too (per official docs)
  const data = await shopifyAdminRequest<any>(DELETE_DEF, { id: 'gid://shopify/MetaobjectDefinition/19023921452' });
  console.log('deleted definition (and its entries):', JSON.stringify(data.metaobjectDefinitionDelete, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
