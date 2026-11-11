import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { createSubcategoryCollection, setMegaMenuMetafields } from '../../src/lib/shopify/collection-helpers.core';

// Smoking should hold only: Lighters, Torch Lighters, Butane, and a "Lighter Accessories" group
// of Lighter Fluid / Lighter Flint / Lighter Wick. Deletes the empty Rolling Accessories, Tobacco
// and standalone Lighter Accessories entries (refuses if any still has products or brands).
const SMOKING = 'gid://shopify/Metaobject/252081012934';
const DELETE = [
  { sub: 'gid://shopify/Metaobject/252081373382', collection: 'rolling-accessories' },
  { sub: 'gid://shopify/Metaobject/252081406150', collection: 'tobacco' },
  { sub: 'gid://shopify/Metaobject/264014463174', collection: 'lighter-accessories' },
];
const LIGHTER_FLUID_SUB = 'gid://shopify/Metaobject/264013447366';
const GROUP = 'Lighter Accessories';

const ok = (errs: any[], what: string) => { if (errs?.length) throw new Error(`${what}: ${JSON.stringify(errs)}`); };
const collectionId = async (handle: string) => {
  const r = await shopifyAdminRequest<any>(`query($h:String!){collectionByHandle(handle:$h){id productsCount{count}}}`, { h: handle });
  return r.collectionByHandle as { id: string; productsCount: { count: number } } | null;
};

async function brandSubRefs(): Promise<string[]> {
  const refs: string[] = [];
  let after: string | null = null;
  do {
    const r: any = await shopifyAdminRequest<any>(`query($a:String){metaobjects(type:"brand",first:250,after:$a){pageInfo{hasNextPage endCursor} nodes{fields{key value}}}}`, { a: after });
    for (const n of r.metaobjects.nodes) for (const f of n.fields) if (f.key === 'sub_category' && f.value) refs.push(f.value);
    after = r.metaobjects.pageInfo.hasNextPage ? r.metaobjects.pageInfo.endCursor : null;
  } while (after);
  return refs;
}

async function main() {
  // 1. Safety check, then delete the 3 empty entries.
  const refs = await brandSubRefs();
  for (const d of DELETE) {
    if (refs.some((r) => r.includes(d.sub))) throw new Error(`${d.sub} still has brands -- aborting`);
    const c = await collectionId(d.collection);
    if (c && c.productsCount.count > 0) throw new Error(`${d.collection} still has ${c.productsCount.count} products -- aborting`);
  }
  for (const d of DELETE) {
    const c = await collectionId(d.collection);
    if (c) {
      const r = await shopifyAdminRequest<any>(`mutation($i:CollectionDeleteInput!){collectionDelete(input:$i){deletedCollectionId userErrors{field message}}}`, { i: { id: c.id } });
      ok(r.collectionDelete.userErrors, 'collectionDelete');
    }
    const r = await shopifyAdminRequest<any>(`mutation($id:ID!){metaobjectDelete(id:$id){deletedId userErrors{field message}}}`, { id: d.sub });
    ok(r.metaobjectDelete.userErrors, 'metaobjectDelete');
    console.log('deleted', d.collection);
  }

  // 2. Lighter Fluids -> Lighter Fluid (sub name, collection title, and its product_type rule).
  const u = await shopifyAdminRequest<any>(`mutation($id:ID!,$m:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$m){userErrors{field message}}}`,
    { id: LIGHTER_FLUID_SUB, m: { fields: [{ key: 'name', value: 'Lighter Fluid' }] } });
  ok(u.metaobjectUpdate.userErrors, 'rename sub');
  const fluid = (await collectionId('lighter-fluids'))!;
  const cu = await shopifyAdminRequest<any>(`mutation($i:CollectionInput!){collectionUpdate(input:$i){userErrors{field message}}}`, { i: {
    id: fluid.id, title: 'Lighter Fluid', ruleSet: { appliedDisjunctively: false, rules: [{ column: 'TYPE', relation: 'EQUALS', condition: 'Lighter Fluid' }] } } });
  ok(cu.collectionUpdate.userErrors, 'rename collection');
  console.log('renamed Lighter Fluids -> Lighter Fluid');

  // 3. New Lighter Flint / Lighter Wick, same shape createSubcategory() produces.
  const created: Record<string, string> = {};
  for (const name of ['Lighter Flint', 'Lighter Wick']) {
    const r = await shopifyAdminRequest<any>(`mutation($m:MetaobjectCreateInput!){metaobjectCreate(metaobject:$m){metaobject{id} userErrors{field message}}}`,
      { m: { type: 'sub_category', fields: [{ key: 'name', value: name }, { key: 'category', value: SMOKING }] } });
    ok(r.metaobjectCreate.userErrors, `create ${name}`);
    created[name] = await createSubcategoryCollection(name);
    console.log('created', name);
  }

  // 4. Mega-menu placement: 4 Panel-1 rows, the last one holding the 3 accessories.
  const place: [string, Parameters<typeof setMegaMenuMetafields>[1]][] = [
    [(await collectionId('lighters-1'))!.id, { navKey: 'smoking', groupLabel: 'Lighters', groupMode: 'subcategory', sortOrder: 1 }],
    [(await collectionId('torch-lighters'))!.id, { sortOrder: 2 }],
    [(await collectionId('butane'))!.id, { sortOrder: 3 }],
    [fluid.id, { navKey: 'smoking', groupLabel: GROUP, groupMode: 'subcategory', sortOrder: 4 }],
    [created['Lighter Flint'], { navKey: 'smoking', groupLabel: GROUP, groupMode: 'subcategory', sortOrder: 5 }],
    [created['Lighter Wick'], { navKey: 'smoking', groupLabel: GROUP, groupMode: 'subcategory', sortOrder: 6 }],
  ];
  for (const [id, input] of place) await setMegaMenuMetafields(id, input);
  console.log('menu placement set');
}
main().catch((e) => { console.error(e); process.exit(1); });
