/**
 * Removes the Cannabis Accessories "Hookahs" and "Storage" sections from the store: deletes their 8
 * collections and 8 sub_category metaobjects (all empty: 0 products, 0 brands). The 5 hookah
 * filter_definitions are kept, unlinked, so a restore can point at them again.
 * Everything deleted is recorded in snapshots/2026-11-14-hookahs-storage.json, and
 * _tmp-restore-hookahs-storage.ts puts it back. See REMOVED_SECTIONS.md at the repo root.
 *
 * Dry run by default; --apply deletes. Refuses to run if any of them has gained products or brands
 * since the snapshot. Run:
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-remove-hookahs-storage.ts [--apply]
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';
import { join } from 'path';

const snap = JSON.parse(readFileSync(join(__dirname, 'snapshots/2026-11-14-hookahs-storage.json'), 'utf-8'));

async function main() {
  const apply = process.argv.includes('--apply');

  for (const c of snap.collections) {
    const r: any = await shopifyAdminRequest<any>(`query($id:ID!){collection(id:$id){id title productsCount{count}}}`, { id: c.id });
    if (!r.collection) { console.log(`collection ${c.title}: already gone`); continue; }
    if (r.collection.productsCount.count > 0) throw new Error(`collection ${c.title} now has ${r.collection.productsCount.count} products -- stopping`);
    if (apply) {
      const d: any = await shopifyAdminRequest<any>(`mutation($i:CollectionDeleteInput!){collectionDelete(input:$i){deletedCollectionId userErrors{field message}}}`, { i: { id: c.id } });
      assertNoUserErrors(d.collectionDelete.userErrors, `delete collection ${c.title}`);
    }
    console.log(`${apply ? 'deleted' : 'would delete'} collection  ${c.title} (${c.handle})`);
  }

  const brands: any = await shopifyAdminRequest<any>(`{metaobjects(type:"brand",first:250){nodes{fields{key value}}}}`);
  const usedBy = new Set(brands.metaobjects.nodes.map((n: any) => n.fields.find((f: any) => f.key === 'sub_category')?.value));
  for (const s of snap.subCategories) {
    const r: any = await shopifyAdminRequest<any>(`query($id:ID!){metaobject(id:$id){id}}`, { id: s.id });
    if (!r.metaobject) { console.log(`sub-category ${s.fields.name}: already gone`); continue; }
    if (usedBy.has(s.id)) throw new Error(`sub-category ${s.fields.name} now has a brand -- stopping`);
    if (apply) {
      const d: any = await shopifyAdminRequest<any>(`mutation($id:ID!){metaobjectDelete(id:$id){deletedId userErrors{field message}}}`, { id: s.id });
      assertNoUserErrors(d.metaobjectDelete.userErrors, `delete sub-category ${s.fields.name}`);
    }
    console.log(`${apply ? 'deleted' : 'would delete'} sub-category ${s.fields.name}`);
  }
  if (!apply) console.log('\nDry run only. Re-run with --apply to delete.');
}
main().catch((e) => { console.error(e); process.exit(1); });
