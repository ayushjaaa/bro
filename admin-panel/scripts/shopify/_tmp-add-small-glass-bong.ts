/**
 * Adds the "Small Glass Bong" section (client SKU legend code SB) under Cannabis Accessories > Bongs
 * and moves the products whose SKUs are CA-BG-SB-... out of "Glass Bong" into it:
 *  1. sub_category "Small Glass Bong" + its collection (product_type rule, Online Store, menu Bongs);
 *  2. a "Gemini Distribution" brand under the new section (brands are per section);
 *  3. each SB product: productType -> "Small Glass Bong", taxonomy.brand -> that new brand;
 *  4. the Bongs menu renumbered so Small Glass Bong sits right after Glass Bong.
 * SKUs, prices, stock, variants, images and product URLs are untouched. Idempotent.
 *
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-add-small-glass-bong.ts            # dry run
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-add-small-glass-bong.ts --apply    # do it
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-add-small-glass-bong.ts --revert   # undo (dry run unless --apply too)
 *
 * --revert moves the SB products back to "Glass Bong" with the Glass Bong "Gemini Distribution" brand,
 * deletes the Small Glass Bong collection, its brand and sub-category, and restores the Bongs order
 * (Glass Bong #5, the rest as before: Straight 1, Beaker 2, Dab Rig 3, Silicone 6 ... Dab Rig Accessories 13).
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';
import { createSubcategoryCollection, setMegaMenuMetafields } from '../../src/lib/shopify/collection-helpers.core';

const CANNABIS_ACCESSORIES = 'gid://shopify/Metaobject/252082094278';
const NEW = 'Small Glass Bong';
const OLD = 'Glass Bong';
const BRAND = 'Gemini Distribution';
const BONGS_ORDER = [
  'Straight Bong', 'Beaker Bong', 'Dab Rig Bong', 'Glass Bong', NEW, 'Silicone Bong', 'Recycler Bong',
  'Zong Bong', 'Gun Bong', 'Oil Glass Bong', 'Nectar Collectors', 'E-Rigs', 'Dab Rig Accessories',
];
// Order before this script (Water Pipes, removed, used to be #4).
const BONGS_ORDER_BEFORE: Record<string, number> = {
  'Straight Bong': 1, 'Beaker Bong': 2, 'Dab Rig Bong': 3, 'Glass Bong': 5, 'Silicone Bong': 6, 'Recycler Bong': 7,
  'Zong Bong': 8, 'Gun Bong': 9, 'Oil Glass Bong': 10, 'Nectar Collectors': 11, 'E-Rigs': 12, 'Dab Rig Accessories': 13,
};

const fieldsOf = (n: any) => Object.fromEntries(n.fields.map((f: any) => [f.key, f.value]));

async function load() {
  const subs: any = await shopifyAdminRequest<any>(`{metaobjects(type:"sub_category",first:250){nodes{id fields{key value}}}}`);
  const subId = (name: string) => subs.metaobjects.nodes.find((n: any) => { const f = fieldsOf(n); return f.name === name && f.category === CANNABIS_ACCESSORIES; })?.id as string | undefined;
  const brands: any = await shopifyAdminRequest<any>(`{metaobjects(type:"brand",first:250){nodes{id fields{key value}}}}`);
  const brandId = (sub?: string) => sub && brands.metaobjects.nodes.find((n: any) => { const f = fieldsOf(n); return f.name === BRAND && f.sub_category === sub; })?.id as string | undefined;
  const cols: any = await shopifyAdminRequest<any>(`{collections(first:250){nodes{id title nav:metafield(namespace:"custom",key:"menu_nav_key"){value}}}}`);
  // A just-created collection has no menu metafields yet, so the new one is matched by title alone.
  const colId = (title: string) => cols.collections.nodes.find((c: any) => c.title === title && (c.nav?.value?.trim() === 'cannabis-accessories' || (title === NEW && !c.nav)))?.id as string | undefined;
  const prods: any = await shopifyAdminRequest<any>(`{products(first:250,query:"product_type:'Glass Bong'"){nodes{id handle productType variants(first:1){nodes{sku}}}}}`);
  const sb = prods.products.nodes.filter((p: any) => (p.productType === OLD || p.productType === NEW) && (p.variants.nodes[0]?.sku ?? '').startsWith('CA-BG-SB-'));
  return { subId, brandId, colId, sb };
}

async function setProduct(id: string, productType: string, brand: string) {
  const r: any = await shopifyAdminRequest<any>(`mutation($p:ProductUpdateInput!){productUpdate(product:$p){userErrors{field message}}}`,
    { p: { id, productType, metafields: [{ namespace: 'taxonomy', key: 'brand', type: 'metaobject_reference', value: brand }] } });
  assertNoUserErrors(r.productUpdate.userErrors, `update product ${id}`);
}

async function forward(apply: boolean) {
  const s = await load();
  let newSub = s.subId(NEW);
  console.log(`sub-category ${NEW}: ${newSub ? 'exists' : apply ? 'creating' : 'would create'}`);
  if (!newSub && apply) {
    const r: any = await shopifyAdminRequest<any>(`mutation($m:MetaobjectCreateInput!){metaobjectCreate(metaobject:$m){metaobject{id} userErrors{field message}}}`,
      { m: { type: 'sub_category', fields: [{ key: 'name', value: NEW }, { key: 'category', value: CANNABIS_ACCESSORIES }] } });
    assertNoUserErrors(r.metaobjectCreate.userErrors, 'create sub-category');
    newSub = r.metaobjectCreate.metaobject.id;
  }
  let col = s.colId(NEW);
  console.log(`collection ${NEW}: ${col ? 'exists' : apply ? 'creating' : 'would create'}`);
  if (!col && apply) col = await createSubcategoryCollection(NEW);
  let brand = s.brandId(newSub);
  console.log(`brand ${BRAND} under ${NEW}: ${brand ? 'exists' : apply ? 'creating' : 'would create'}`);
  if (!brand && apply) {
    const r: any = await shopifyAdminRequest<any>(`mutation($m:MetaobjectCreateInput!){metaobjectCreate(metaobject:$m){metaobject{id} userErrors{field message}}}`,
      { m: { type: 'brand', fields: [{ key: 'name', value: BRAND }, { key: 'sub_category', value: newSub }] } });
    assertNoUserErrors(r.metaobjectCreate.userErrors, 'create brand');
    brand = r.metaobjectCreate.metaobject.id;
  }
  for (const p of s.sb) {
    if (p.productType === NEW) { console.log(`  ${p.handle}: already moved`); continue; }
    if (apply) await setProduct(p.id, NEW, brand!);
    console.log(`  ${apply ? 'moved' : 'would move'} ${p.handle}`);
  }
  console.log(`${s.sb.length} SB products`);
  if (apply) {
    const s2 = await load();
    for (const [i, title] of BONGS_ORDER.entries()) {
      const id = s2.colId(title);
      if (!id) throw new Error(`no collection ${title}`);
      await setMegaMenuMetafields(id, { navKey: 'cannabis-accessories', groupLabel: 'Bongs', groupMode: 'subcategory', sortOrder: i + 1 });
    }
    console.log('Bongs menu renumbered:', BONGS_ORDER.map((t, i) => `${i + 1} ${t}`).join(', '));
  } else console.log('\nDry run only. Re-run with --apply.');
}

async function revert(apply: boolean) {
  const s = await load();
  const oldBrand = s.brandId(s.subId(OLD));
  if (!oldBrand) throw new Error(`no ${BRAND} brand under ${OLD}`);
  for (const p of s.sb) {
    if (p.productType === OLD) { console.log(`  ${p.handle}: already in ${OLD}`); continue; }
    if (apply) await setProduct(p.id, OLD, oldBrand);
    console.log(`  ${apply ? 'moved back' : 'would move back'} ${p.handle}`);
  }
  const col = s.colId(NEW); const newSub = s.subId(NEW); const brand = s.brandId(newSub);
  if (apply) {
    if (col) assertNoUserErrors((await shopifyAdminRequest<any>(`mutation($i:CollectionDeleteInput!){collectionDelete(input:$i){userErrors{field message}}}`, { i: { id: col } })).collectionDelete.userErrors, 'delete collection');
    for (const id of [brand, newSub].filter(Boolean)) assertNoUserErrors((await shopifyAdminRequest<any>(`mutation($id:ID!){metaobjectDelete(id:$id){userErrors{field message}}}`, { id })).metaobjectDelete.userErrors, 'delete metaobject');
    for (const [title, n] of Object.entries(BONGS_ORDER_BEFORE)) {
      const id = s.colId(title); if (id) await setMegaMenuMetafields(id, { sortOrder: n });
    }
  }
  console.log(`${apply ? 'deleted' : 'would delete'} ${NEW} collection, brand and sub-category; ${apply ? 'restored' : 'would restore'} Bongs order`);
  if (!apply) console.log('\nDry run only. Re-run with --revert --apply.');
}

const apply = process.argv.includes('--apply');
(process.argv.includes('--revert') ? revert(apply) : forward(apply)).catch((e) => { console.error(e); process.exit(1); });
