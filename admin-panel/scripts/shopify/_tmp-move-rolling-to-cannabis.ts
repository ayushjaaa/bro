import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const CANNABIS = 'gid://shopify/Metaobject/252082094278';
const SUBS = ['gid://shopify/Metaobject/252081045702','gid://shopify/Metaobject/252081275078','gid://shopify/Metaobject/252081307846','gid://shopify/Metaobject/252081340614'];
const HANDLES: [string, number][] = [['rolling-papers',10],['blunts-wraps',11],['pre-rolled-cones',12],['filters-tips',13]];
async function main() {
  for (const id of SUBS) {
    const r = await shopifyAdminRequest<any>(`mutation($id:ID!,$m:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$m){metaobject{id} userErrors{field message}}}`,
      { id, m: { fields: [{ key: 'category', value: CANNABIS }] } });
    if (r.metaobjectUpdate.userErrors.length) throw new Error(JSON.stringify(r.metaobjectUpdate.userErrors));
    console.log('sub moved', id);
  }
  for (const [handle, sort] of HANDLES) {
    const c = await shopifyAdminRequest<any>(`query($h:String!){collectionByHandle(handle:$h){id}}`, { h: handle });
    const ownerId = c.collectionByHandle.id;
    const r = await shopifyAdminRequest<any>(`mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){userErrors{field message}}}`, { m: [
      { ownerId, namespace: 'custom', key: 'menu_nav_key', type: 'single_line_text_field', value: 'cannabis-accessories' },
      { ownerId, namespace: 'custom', key: 'menu_sort_order', type: 'number_integer', value: String(sort) },
    ] });
    if (r.metafieldsSet.userErrors.length) throw new Error(handle + JSON.stringify(r.metafieldsSet.userErrors));
    console.log('collection moved', handle);
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
