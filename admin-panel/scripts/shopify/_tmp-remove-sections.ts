/**
 * Removes the sections recorded in a snapshot made by _tmp-snapshot-sections.ts: deletes their
 * collections and sub_category metaobjects. Their filter_definitions are kept (only unlinked).
 * Stops if any of them has products or brands now. Dry run by default; --apply deletes.
 * Record the removal in REMOVED_SECTIONS.md; _tmp-restore-sections.ts undoes it. Run:
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-remove-sections.ts <snapshot.json> [--apply]
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes('--apply');
  const snap = JSON.parse(readFileSync(file, 'utf-8'));

  const brands: any = await shopifyAdminRequest<any>(`{metaobjects(type:"brand",first:250){nodes{fields{key value}}}}`);
  const usedBy = new Set(brands.metaobjects.nodes.map((n: any) => n.fields.find((f: any) => f.key === 'sub_category')?.value));
  for (const s of snap.subCategories) {
    if (usedBy.has(s.id)) throw new Error(`sub-category ${s.fields.name} now has a brand -- stopping`);
    const r: any = await shopifyAdminRequest<any>(`query($q:String!){products(first:5,query:$q){nodes{productType}}}`, { q: `product_type:'${s.fields.name}'` });
    if (r.products.nodes.some((p: any) => p.productType === s.fields.name)) throw new Error(`sub-category ${s.fields.name} now has products -- stopping`);
  }

  for (const c of snap.collections) {
    const r: any = await shopifyAdminRequest<any>(`query($id:ID!){collection(id:$id){id}}`, { id: c.id });
    if (!r.collection) { console.log(`collection ${c.title}: already gone`); continue; }
    if (apply) {
      const d: any = await shopifyAdminRequest<any>(`mutation($i:CollectionDeleteInput!){collectionDelete(input:$i){deletedCollectionId userErrors{field message}}}`, { i: { id: c.id } });
      assertNoUserErrors(d.collectionDelete.userErrors, `delete collection ${c.title}`);
    }
    console.log(`${apply ? 'deleted' : 'would delete'} collection  ${c.title} (${c.handle})`);
  }
  for (const s of snap.subCategories) {
    const r: any = await shopifyAdminRequest<any>(`query($id:ID!){metaobject(id:$id){id}}`, { id: s.id });
    if (!r.metaobject) { console.log(`sub-category ${s.fields.name}: already gone`); continue; }
    if (apply) {
      const d: any = await shopifyAdminRequest<any>(`mutation($id:ID!){metaobjectDelete(id:$id){deletedId userErrors{field message}}}`, { id: s.id });
      assertNoUserErrors(d.metaobjectDelete.userErrors, `delete sub-category ${s.fields.name}`);
    }
    console.log(`${apply ? 'deleted' : 'would delete'} sub-category ${s.fields.name}`);
  }
  if (!apply) console.log('\nDry run only. Re-run with --apply to delete.');
}
main().catch((e) => { console.error(e); process.exit(1); });
