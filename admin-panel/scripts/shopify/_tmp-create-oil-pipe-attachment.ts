import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { createSubcategoryCollection, setMegaMenuMetafields } from '../../src/lib/shopify/collection-helpers.core';
// Creates the "Oil Pipe Attachment" sub-category (Cannabis Accessories) the same way createSubcategory() does,
// plus its collection and mega-menu slot (Bong Accessories, after Bowls) and its "Gemini Distribution" brand.
// Idempotent: reuses anything that already exists.
const CANNABIS = 'gid://shopify/Metaobject/252082094278';
const NAME = 'Oil Pipe Attachment';
async function main() {
  const subs = await shopifyAdminRequest<any>(`{metaobjects(type:"sub_category",first:250){nodes{id fields{key value}}}}`);
  let subId = subs.metaobjects.nodes.find((n: any) => n.fields.some((f: any) => f.key === 'name' && f.value === NAME))?.id;
  if (!subId) {
    const r = await shopifyAdminRequest<any>(`mutation($m:MetaobjectCreateInput!){metaobjectCreate(metaobject:$m){metaobject{id} userErrors{field message}}}`,
      { m: { type: 'sub_category', fields: [{ key: 'name', value: NAME }, { key: 'category', value: CANNABIS }] } });
    if (r.metaobjectCreate.userErrors.length) throw new Error(JSON.stringify(r.metaobjectCreate.userErrors));
    subId = r.metaobjectCreate.metaobject.id; console.log('created sub-category', subId);
  } else console.log('sub-category exists', subId);
  const c = await shopifyAdminRequest<any>(`{collections(first:250){nodes{id title}}}`);
  let colId = c.collections.nodes.find((n: any) => n.title === NAME)?.id;
  if (!colId) { colId = await createSubcategoryCollection(NAME); console.log('created collection', colId); } else console.log('collection exists', colId);
  await setMegaMenuMetafields(colId, { navKey: 'cannabis-accessories', groupLabel: 'Bong Accessories', groupMode: 'subcategory', sortOrder: 4 });
  console.log('menu slot set: Bong Accessories #4');
  const b = await shopifyAdminRequest<any>(`{metaobjects(type:"brand",first:250){nodes{id fields{key value}}}}`);
  const has = b.metaobjects.nodes.some((n: any) => { const f = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value])); return f.name === 'Gemini Distribution' && f.sub_category === subId; });
  if (!has) {
    const r = await shopifyAdminRequest<any>(`mutation($m:MetaobjectCreateInput!){metaobjectCreate(metaobject:$m){metaobject{id} userErrors{field message}}}`,
      { m: { type: 'brand', fields: [{ key: 'name', value: 'Gemini Distribution' }, { key: 'sub_category', value: subId }] } });
    if (r.metaobjectCreate.userErrors.length) throw new Error(JSON.stringify(r.metaobjectCreate.userErrors));
    console.log('created brand Gemini Distribution', r.metaobjectCreate.metaobject.id);
  } else console.log('brand exists');
  console.log('SUB_ID=' + subId);
}
main().catch((e) => { console.error(e); process.exit(1); });
