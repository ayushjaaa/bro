import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const FIND = /* GraphQL */ `
  query { metaobjects(type: "sub_category", first: 50) { nodes { id fields { key value } } } }
`;
const DELETE = /* GraphQL */ `
  mutation($id: ID!) { metaobjectDelete(id: $id) { deletedId userErrors { field message } } }
`;

async function main() {
  const data = await shopifyAdminRequest<any>(FIND);
  const target = data.metaobjects.nodes.find((n: any) =>
    n.fields.some((f: any) => f.key === 'name' && f.value === 'Automation Test Sub-category')
  );
  if (!target) { console.log('not found, nothing to clean'); return; }
  const del = await shopifyAdminRequest<any>(DELETE, { id: target.id });
  assertNoUserErrors(del.metaobjectDelete.userErrors, 'metaobjectDelete');
  console.log('deleted:', del.metaobjectDelete.deletedId);
}
main().catch((e) => { console.error(e); process.exit(1); });
