import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const REMOVE_TAGS = `mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { field message } } }`;
const DELETE_MF = `mutation($input: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $input) { userErrors { field message } } }`;
const VERIFY = `query($id: ID!) { product(id: $id) { tags metafields(first: 10, namespace: "custom") { nodes { key value } } } }`;
async function main() {
  const id = 'gid://shopify/Product/9093229609158';
  const r1 = await shopifyAdminRequest<any>(REMOVE_TAGS, { id, tags: ['region-federal'] });
  console.log('tagsRemove:', JSON.stringify(r1));
  const r2 = await shopifyAdminRequest<any>(DELETE_MF, { input: [{ ownerId: id, namespace: 'custom', key: 'region' }] });
  console.log('metafieldsDelete:', JSON.stringify(r2));
  const r3 = await shopifyAdminRequest<any>(VERIFY, { id });
  console.log('after:', JSON.stringify(r3, null, 2));
}
main().catch(e=>{console.error(e);process.exit(1)});
