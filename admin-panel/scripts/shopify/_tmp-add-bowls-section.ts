/**
 * Adds the "Bowls" section (client SKU legend code BA-BW) under Cannabis Accessories, in the
 * "Bong Accessories" menu group at #3 (after Cleaning #1 and Replacement Parts #2, which keep their
 * order): sub_category "Bowls" + its collection (product_type rule, Online Store). Brands are created
 * by the product import. Idempotent.
 *
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-add-bowls-section.ts            # dry run
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-add-bowls-section.ts --apply    # do it
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-add-bowls-section.ts --revert --apply
 *
 * --revert deletes the Bowls collection and sub-category; it stops if any product or brand still uses it.
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';
import { createSubcategoryCollection, setMegaMenuMetafields } from '../../src/lib/shopify/collection-helpers.core';

const CANNABIS_ACCESSORIES = 'gid://shopify/Metaobject/252082094278';
const NAME = 'Bowls';

const fieldsOf = (n: any) => Object.fromEntries(n.fields.map((f: any) => [f.key, f.value]));

async function load() {
  const subs: any = await shopifyAdminRequest<any>(`{metaobjects(type:"sub_category",first:250){nodes{id fields{key value}}}}`);
  const sub = subs.metaobjects.nodes.find((n: any) => { const f = fieldsOf(n); return f.name === NAME && f.category === CANNABIS_ACCESSORIES; })?.id as string | undefined;
  const cols: any = await shopifyAdminRequest<any>(`{collections(first:250){nodes{id title ruleSet{rules{column relation condition}}}}}`);
  const col = cols.collections.nodes.find((c: any) => c.ruleSet?.rules?.some((r: any) => r.column === 'TYPE' && r.condition === NAME))?.id as string | undefined;
  return { sub, col };
}

async function forward(apply: boolean) {
  let { sub, col } = await load();
  console.log(`sub-category ${NAME}: ${sub ? 'exists' : apply ? 'creating' : 'would create'}`);
  if (!sub && apply) {
    const r: any = await shopifyAdminRequest<any>(`mutation($m:MetaobjectCreateInput!){metaobjectCreate(metaobject:$m){metaobject{id} userErrors{field message}}}`,
      { m: { type: 'sub_category', fields: [{ key: 'name', value: NAME }, { key: 'category', value: CANNABIS_ACCESSORIES }] } });
    assertNoUserErrors(r.metaobjectCreate.userErrors, 'create sub-category');
    sub = r.metaobjectCreate.metaobject.id;
  }
  console.log(`collection ${NAME}: ${col ? 'exists' : apply ? 'creating' : 'would create'}`);
  if (!col && apply) col = await createSubcategoryCollection(NAME);
  if (apply) {
    await setMegaMenuMetafields(col!, { navKey: 'cannabis-accessories', groupLabel: 'Bong Accessories', groupMode: 'subcategory', sortOrder: 3 });
    console.log('menu: Bong Accessories #3');
  } else console.log('would place in menu: Bong Accessories #3\n\nDry run only. Re-run with --apply.');
}

async function revert(apply: boolean) {
  const { sub, col } = await load();
  const p: any = await shopifyAdminRequest<any>(`{products(first:5,query:"product_type:'${NAME}'"){nodes{productType}}}`);
  if (p.products.nodes.some((n: any) => n.productType === NAME)) throw new Error(`${NAME} still has products -- stopping`);
  const brands: any = await shopifyAdminRequest<any>(`{metaobjects(type:"brand",first:250){nodes{fields{key value}}}}`);
  if (sub && brands.metaobjects.nodes.some((n: any) => fieldsOf(n).sub_category === sub)) throw new Error(`${NAME} still has brands -- stopping`);
  if (apply) {
    if (col) assertNoUserErrors((await shopifyAdminRequest<any>(`mutation($i:CollectionDeleteInput!){collectionDelete(input:$i){userErrors{field message}}}`, { i: { id: col } })).collectionDelete.userErrors, 'delete collection');
    if (sub) assertNoUserErrors((await shopifyAdminRequest<any>(`mutation($id:ID!){metaobjectDelete(id:$id){userErrors{field message}}}`, { id: sub })).metaobjectDelete.userErrors, 'delete sub-category');
  }
  console.log(`${apply ? 'deleted' : 'would delete'} ${NAME} collection and sub-category`);
}

const apply = process.argv.includes('--apply');
(process.argv.includes('--revert') ? revert(apply) : forward(apply)).catch((e) => { console.error(e); process.exit(1); });
