import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const MUTATION = /* GraphQL */ `
  mutation MetaobjectCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject { id handle }
      userErrors { field message }
    }
  }
`;

async function main() {
  const data = await shopifyAdminRequest<any>(MUTATION, {
    metaobject: {
      type: 'category',
      fields: [
        { key: 'name', value: 'Test Category From Script' },
        { key: 'description', value: 'created via _tmp test script' },
      ],
    },
  });
  assertNoUserErrors(data.metaobjectCreate.userErrors, 'metaobjectCreate');
  console.log('created:', JSON.stringify(data.metaobjectCreate.metaobject, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
