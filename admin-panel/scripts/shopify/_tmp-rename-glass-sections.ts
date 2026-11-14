/**
 * Renames the Cannabis Accessories glass sections to the client's SKU legend names
 * (Beaker Bongs -> Beaker Bong, Dab Rigs -> Dab Rig Bong, ...). For each one it renames the
 * sub_category metaobject, the matching Collection (title + its product_type rule) and every
 * product's productType. Nothing else changes: SKUs, prices, stock, variants, images, brands
 * (linked by id) and the collection's handle and menu placement stay as they are.
 * The storefront's old ?subcategory= slugs are redirected in storefront/src/lib/seo/subcategory-aliases.ts.
 *
 * Idempotent (already-renamed items are skipped). Run with --dry-run first to see the counts:
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-rename-glass-sections.ts [--dry-run]
 * To roll back, swap the two columns of RENAMES and run again.
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const CANNABIS_ACCESSORIES = 'gid://shopify/Metaobject/252082094278';
const RENAMES: [string, string][] = [
  ['Beaker Bongs', 'Beaker Bong'],
  ['Glass Bongs', 'Glass Bong'],
  ['Gun Bongs', 'Gun Bong'],
  ['Zong Bongs', 'Zong Bong'],
  ['Dab Rigs', 'Dab Rig Bong'],
  ['Oil Bongs', 'Oil Glass Bong'],
  ['Recycler Bongs', 'Recycler Bong'],
  ['Silicone Bongs', 'Silicone Bong'],
  ['Straight Tube Bongs', 'Straight Bong'],
  ['Oil Pipes', 'Oil Pipe'],
  ['Glass Pipes', 'Glass Pipe'],
];

async function allPages<T>(query: string, pick: (d: any) => { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }): Promise<T[]> {
  const out: T[] = []; let after: string | null = null;
  do {
    const conn = pick(await shopifyAdminRequest<any>(query, { a: after }));
    out.push(...conn.nodes);
    after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after);
  return out;
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const subs = await allPages<any>(`query($a:String){metaobjects(type:"sub_category",first:250,after:$a){pageInfo{hasNextPage endCursor} nodes{id fields{key value}}}}`, (d) => d.metaobjects);
  const cannabisSubs = subs
    .map((n) => ({ id: n.id, ...Object.fromEntries(n.fields.map((f: any) => [f.key, f.value])) }))
    .filter((s: any) => s.category === CANNABIS_ACCESSORIES);
  const cols = await allPages<any>(`query($a:String){collections(first:250,after:$a){pageInfo{hasNextPage endCursor} nodes{id title ruleSet{rules{column relation condition}}}}}`, (d) => d.collections);
  const products = await allPages<any>(`query($a:String){products(first:250,after:$a){pageInfo{hasNextPage endCursor} nodes{id handle productType}}}`, (d) => d.products);

  for (const [from, to] of RENAMES) {
    const sub = cannabisSubs.find((s: any) => s.name === from) ?? cannabisSubs.find((s: any) => s.name === to);
    if (!sub) throw new Error(`no Cannabis Accessories sub-category named "${from}" or "${to}"`);
    const ruleOf = (c: any) => c.ruleSet?.rules?.find((r: any) => r.column === 'TYPE' && r.relation === 'EQUALS')?.condition;
    const col = cols.find((c) => ruleOf(c) === from) ?? cols.find((c) => ruleOf(c) === to);
    if (!col) throw new Error(`no collection with rule product_type = "${from}" or "${to}"`);
    const prods = products.filter((p) => p.productType === from);
    const done = products.filter((p) => p.productType === to).length;
    console.log(`${from.padEnd(20)} -> ${to.padEnd(16)} sub:${sub.name === to ? 'done' : 'rename'}  collection:${col.title === to ? 'done' : 'rename'}  products to update: ${prods.length} (already: ${done})`);
    if (dry) continue;

    if (sub.name !== to) {
      const r: any = await shopifyAdminRequest<any>(`mutation($id:ID!,$m:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$m){userErrors{field message}}}`,
        { id: sub.id, m: { fields: [{ key: 'name', value: to }] } });
      assertNoUserErrors(r.metaobjectUpdate.userErrors, `rename sub-category ${from}`);
    }
    if (col.title !== to || ruleOf(col) !== to) {
      const r: any = await shopifyAdminRequest<any>(`mutation($i:CollectionInput!){collectionUpdate(input:$i){userErrors{field message}}}`,
        { i: { id: col.id, title: to, ruleSet: { appliedDisjunctively: false, rules: [{ column: 'TYPE', relation: 'EQUALS', condition: to }] } } });
      assertNoUserErrors(r.collectionUpdate.userErrors, `rename collection ${from}`);
    }
    for (const p of prods) {
      const r: any = await shopifyAdminRequest<any>(`mutation($p:ProductUpdateInput!){productUpdate(product:$p){userErrors{field message}}}`,
        { p: { id: p.id, productType: to } });
      assertNoUserErrors(r.productUpdate.userErrors, `product ${p.handle}`);
    }
    console.log(`   done: ${prods.length} products updated`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
