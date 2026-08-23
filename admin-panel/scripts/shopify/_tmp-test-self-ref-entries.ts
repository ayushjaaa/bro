import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const CREATE_ENTRY = /* GraphQL */ `
  mutation($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject { id handle }
      userErrors { field message }
    }
  }
`;

async function createNode(name: string, parentId?: string) {
  const fields = [{ key: 'name', value: name }];
  if (parentId) fields.push({ key: 'parent', value: parentId });
  const data = await shopifyAdminRequest<any>(CREATE_ENTRY, {
    metaobject: { type: 'test_taxonomy_node', fields },
  });
  assertNoUserErrors(data.metaobjectCreate.userErrors, `create ${name}`);
  console.log(`created "${name}" ->`, data.metaobjectCreate.metaobject.id);
  return data.metaobjectCreate.metaobject.id;
}

async function main() {
  // 4-level chain: Smoking -> Rolling Accessories -> Rolling Papers -> RAW
  const level1 = await createNode('Smoking (test)');
  const level2 = await createNode('Rolling Accessories (test)', level1);
  const level3 = await createNode('Rolling Papers (test)', level2);
  const level4 = await createNode('RAW (test)', level3);
  console.log('\n4-level chain created successfully:', { level1, level2, level3, level4 });
}
main().catch((e) => { console.error(e); process.exit(1); });
