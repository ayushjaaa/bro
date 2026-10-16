import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const M = /* GraphQL */ `mutation($metaobject: MetaobjectCreateInput!) { metaobjectCreate(metaobject: $metaobject) { metaobject { id } userErrors { field message } } }`;
async function main() {
  const res = await shopifyAdminRequest<any>(M, { metaobject: { type: 'brand', fields: [
    { key: 'name', value: 'Jumbo' },
    { key: 'sub_category', value: 'gid://shopify/Metaobject/252081307846' },
  ]}});
  console.log(JSON.stringify(res, null, 2));
}
main().catch(e=>{console.error(e);process.exit(1)});
