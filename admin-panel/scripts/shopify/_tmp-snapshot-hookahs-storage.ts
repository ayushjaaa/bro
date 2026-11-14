/**
 * Read-only: snapshots everything in Shopify that belongs to the Cannabis Accessories "Hookahs" and
 * "Storage" menu groups (sub_category metaobjects, their collections with rules + menu metafields +
 * publications, brands, products, and the filter_definitions they reference), as JSON, so the
 * removal can be reverted exactly. Run:
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-snapshot-hookahs-storage.ts <out.json>
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { writeFileSync } from 'fs';

const CANNABIS_ACCESSORIES = 'gid://shopify/Metaobject/252082094278';
const GROUPS = ['Hookahs', 'Storage'];

async function main() {
  const subsR: any = await shopifyAdminRequest<any>(`{metaobjects(type:"sub_category",first:250){nodes{id handle displayName fields{key value}}}}`);
  const colsR: any = await shopifyAdminRequest<any>(`{collections(first:250){nodes{id handle title descriptionHtml sortOrder
    ruleSet{appliedDisjunctively rules{column relation condition}}
    productsCount{count}
    resourcePublications(first:10){nodes{publication{id name}}}
    metafields(first:20,namespace:"custom"){nodes{namespace key type value}}}}}`);
  const cols = colsR.collections.nodes.map((c: any) => ({ ...c, menu: Object.fromEntries(c.metafields.nodes.map((m: any) => [m.key, m.value])) }));
  const ours = cols.filter((c: any) => c.menu.menu_nav_key === 'cannabis-accessories' && GROUPS.includes(c.menu.menu_group_label));
  const titles = new Set(ours.map((c: any) => c.title));
  const subs = subsR.metaobjects.nodes
    .map((n: any) => ({ id: n.id, handle: n.handle, fields: Object.fromEntries(n.fields.map((f: any) => [f.key, f.value])) }))
    .filter((s: any) => s.fields.category === CANNABIS_ACCESSORIES && titles.has(s.fields.name));
  const subIds = new Set(subs.map((s: any) => s.id));

  const brandsR: any = await shopifyAdminRequest<any>(`{metaobjects(type:"brand",first:250){nodes{id handle fields{key value}}}}`);
  const brands = brandsR.metaobjects.nodes
    .map((n: any) => ({ id: n.id, handle: n.handle, fields: Object.fromEntries(n.fields.map((f: any) => [f.key, f.value])) }))
    .filter((b: any) => subIds.has(b.fields.sub_category));

  const filterIds = [...new Set(subs.flatMap((s: any) => (s.fields.relevant_filters ? JSON.parse(s.fields.relevant_filters) : [])))];
  const filters = [];
  for (const id of filterIds) {
    const r: any = await shopifyAdminRequest<any>(`query($id:ID!){metaobject(id:$id){id handle fields{key value}}}`, { id });
    if (r.metaobject) filters.push({ id: r.metaobject.id, handle: r.metaobject.handle, fields: Object.fromEntries(r.metaobject.fields.map((f: any) => [f.key, f.value])) });
  }
  // Is any filter_definition also used by a sub-category we are NOT removing?
  const sharedFilters = filterIds.filter((fid) =>
    subsR.metaobjects.nodes.some((n: any) => !subIds.has(n.id) && (n.fields.find((f: any) => f.key === 'relevant_filters')?.value ?? '').includes(fid as string)));

  const products: any[] = [];
  for (const t of titles) {
    const r: any = await shopifyAdminRequest<any>(`query($q:String!){products(first:250,query:$q){nodes{id handle title productType status}}}`, { q: `product_type:'${t}'` });
    products.push(...r.products.nodes.filter((p: any) => p.productType === t));
  }

  const out = { takenAt: new Date().toISOString(), groups: GROUPS, subCategories: subs, collections: ours, brands, filterDefinitions: filters, sharedFilterIds: sharedFilters, products };
  writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
  console.log(`sub-categories ${subs.length}, collections ${ours.length}, brands ${brands.length}, filter_definitions ${filters.length} (shared with other sections: ${sharedFilters.length}), products ${products.length}`);
  for (const c of ours) console.log(`  ${c.menu.menu_group_label.padEnd(8)} #${c.menu.menu_sort_order}  ${c.title.padEnd(28)} handle=${c.handle} products=${c.productsCount.count} published=${c.resourcePublications.nodes.map((p: any) => p.publication.name).join(',')}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
