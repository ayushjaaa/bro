/**
 * Read-only: snapshots the named sub-categories (sections) before they are removed, as JSON, so
 * _tmp-restore-sections.ts can put them back exactly: the sub_category metaobjects, their
 * collections (rule, publications, mega-menu metafields), and the brands, filter_definitions and
 * products tied to them. Record every removal in REMOVED_SECTIONS.md. Run:
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-snapshot-sections.ts <out.json> "Section A" ["Section B" ...]
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { writeFileSync } from 'fs';

async function main() {
  const [out, ...names] = process.argv.slice(2);
  if (!out || names.length === 0) throw new Error('usage: <out.json> "Section A" ["Section B" ...]');

  const subsR: any = await shopifyAdminRequest<any>(`{metaobjects(type:"sub_category",first:250){nodes{id handle fields{key value}}}}`);
  const all = subsR.metaobjects.nodes.map((n: any) => ({ id: n.id, handle: n.handle, fields: Object.fromEntries(n.fields.map((f: any) => [f.key, f.value])) }));
  const subs = all.filter((s: any) => names.includes(s.fields.name));
  const missing = names.filter((n) => !subs.some((s: any) => s.fields.name === n));
  if (missing.length) throw new Error(`no sub-category named: ${missing.join(', ')}`);
  const subIds = new Set(subs.map((s: any) => s.id));

  const colsR: any = await shopifyAdminRequest<any>(`{collections(first:250){nodes{id handle title ruleSet{appliedDisjunctively rules{column relation condition}}
    productsCount{count} resourcePublications(first:10){nodes{publication{id name}}} metafields(first:20,namespace:"custom"){nodes{key value}}}}}`);
  const ruleOf = (c: any) => c.ruleSet?.rules?.find((r: any) => r.column === 'TYPE' && r.relation === 'EQUALS')?.condition;
  const collections = colsR.collections.nodes
    .filter((c: any) => names.includes(ruleOf(c)))
    .map((c: any) => ({ ...c, menu: Object.fromEntries(c.metafields.nodes.map((m: any) => [m.key, m.value])) }));

  const brandsR: any = await shopifyAdminRequest<any>(`{metaobjects(type:"brand",first:250){nodes{id handle fields{key value}}}}`);
  const brands = brandsR.metaobjects.nodes
    .map((n: any) => ({ id: n.id, handle: n.handle, fields: Object.fromEntries(n.fields.map((f: any) => [f.key, f.value])) }))
    .filter((b: any) => subIds.has(b.fields.sub_category));

  const filterIds = [...new Set(subs.flatMap((s: any) => (s.fields.relevant_filters ? JSON.parse(s.fields.relevant_filters) : [])))] as string[];
  const sharedFilterIds = filterIds.filter((fid) => all.some((s: any) => !subIds.has(s.id) && (s.fields.relevant_filters ?? '').includes(fid)));

  const products: any[] = [];
  for (const n of names) {
    const r: any = await shopifyAdminRequest<any>(`query($q:String!){products(first:250,query:$q){nodes{id handle title productType status}}}`, { q: `product_type:'${n}'` });
    products.push(...r.products.nodes.filter((p: any) => p.productType === n));
  }

  writeFileSync(out, JSON.stringify({ takenAt: new Date().toISOString(), sections: names, subCategories: subs, collections, brands, filterIds, sharedFilterIds, products }, null, 2));
  console.log(`sub-categories ${subs.length}, collections ${collections.length}, brands ${brands.length}, filters ${filterIds.length} (shared ${sharedFilterIds.length}), products ${products.length}`);
  for (const c of collections) console.log(`  ${c.title}  handle=${c.handle}  products=${c.productsCount.count}  menu=${c.menu.menu_nav_key}/${c.menu.menu_group_label}#${c.menu.menu_sort_order}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
