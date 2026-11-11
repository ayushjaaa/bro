/**
 * Creates the 7 sub-categories the client's glass/silicone export needs that the store doesn't
 * have yet, each under Cannabis Accessories with its own Collection and mega-menu placement
 * (group "Bongs" or "Pipes", after the existing entries). Idempotent: an existing sub-category
 * or collection with the same name is reused, not duplicated. Run:
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-create-glass-sections.ts
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';
import { createSubcategoryCollection, setMegaMenuMetafields } from '../../src/lib/shopify/collection-helpers.core';

const CANNABIS_ACCESSORIES = 'gid://shopify/Metaobject/252082094278';
const SECTIONS = [
  { name: 'Glass Bongs', group: 'Bongs', sort: 4 },
  { name: 'Silicone Bongs', group: 'Bongs', sort: 5 },
  { name: 'Recycler Bongs', group: 'Bongs', sort: 6 },
  { name: 'Zong Bongs', group: 'Bongs', sort: 7 },
  { name: 'Gun Bongs', group: 'Bongs', sort: 8 },
  { name: 'Oil Bongs', group: 'Bongs', sort: 9 },
  { name: 'Oil Pipes', group: 'Pipes', sort: 4 },
];

async function main() {
  const subs: any = await shopifyAdminRequest<any>(`{metaobjects(type:"sub_category",first:250){nodes{id fields{key value}}}}`);
  const subByName = new Map<string, string>(subs.metaobjects.nodes.map((n: any) => [n.fields.find((f: any) => f.key === 'name').value, n.id]));
  const cols: any = await shopifyAdminRequest<any>(`{collections(first:250){nodes{id title}}}`);
  const colByName = new Map<string, string>(cols.collections.nodes.map((n: any) => [n.title, n.id]));

  for (const s of SECTIONS) {
    let subId = subByName.get(s.name);
    if (!subId) {
      const r: any = await shopifyAdminRequest<any>(`mutation($m:MetaobjectCreateInput!){metaobjectCreate(metaobject:$m){metaobject{id} userErrors{field message}}}`,
        { m: { type: 'sub_category', fields: [{ key: 'name', value: s.name }, { key: 'category', value: CANNABIS_ACCESSORIES }] } });
      assertNoUserErrors(r.metaobjectCreate.userErrors, `sub_category ${s.name}`);
      subId = r.metaobjectCreate.metaobject.id;
    }
    let colId = colByName.get(s.name);
    if (!colId) colId = await createSubcategoryCollection(s.name);
    await setMegaMenuMetafields(colId!, { navKey: 'cannabis-accessories', groupLabel: s.group, groupMode: 'subcategory', sortOrder: s.sort });
    console.log(`${s.name}: sub_category ${subId}, collection ${colId}, menu ${s.group} #${s.sort}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
