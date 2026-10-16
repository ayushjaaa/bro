import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const id = 'gid://shopify/Product/9093244092614';
const GET = `query($id: ID!) { product(id: $id) { metafields(first: 20, namespace: "custom") { nodes { key value } } } }`;
const SET = `mutation($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { key value } userErrors { field message } } }`;
async function main() {
  const before = await shopifyAdminRequest<any>(GET, { id });
  console.log('before:', JSON.stringify(before.product.metafields.nodes));
  const res = await shopifyAdminRequest<any>(SET, {
    metafields: [{ ownerId: id, namespace: 'custom', key: 'torch_lighter_pack_display_quantity', type: 'single_line_text_field', value: '12' }],
  });
  console.log('set result:', JSON.stringify(res));
  const after = await shopifyAdminRequest<any>(GET, { id });
  console.log('after:', JSON.stringify(after.product.metafields.nodes));
}
main().catch(e=>{console.error(e);process.exit(1)});
