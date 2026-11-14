/**
 * Puts back the Cannabis Accessories "Hookahs" and "Storage" sections removed on 2026-11-14, from
 * snapshots/2026-11-14-hookahs-storage.json: recreates the 8 sub_category metaobjects (Hookahs
 * re-linked to its 5 kept filter_definitions) and the 8 collections with their original handle,
 * product_type rule, Online Store publication and mega-menu placement (Hookahs / Storage groups).
 * New Shopify IDs are created; nothing else in the store refers to the old ones.
 * See REMOVED_SECTIONS.md at the repo root.
 *
 * Dry run by default; --apply creates. Skips anything that already exists by name/handle. Run:
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-restore-hookahs-storage.ts [--apply]
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';
import { setMegaMenuMetafields } from '../../src/lib/shopify/collection-helpers.core';
import { readFileSync } from 'fs';
import { join } from 'path';

const snap = JSON.parse(readFileSync(join(__dirname, 'snapshots/2026-11-14-hookahs-storage.json'), 'utf-8'));

async function main() {
  const apply = process.argv.includes('--apply');
  const subsR: any = await shopifyAdminRequest<any>(`{metaobjects(type:"sub_category",first:250){nodes{fields{key value}}}}`);
  const existingSubs = new Set(subsR.metaobjects.nodes.map((n: any) => n.fields.find((f: any) => f.key === 'name')?.value));
  const pubs: any = await shopifyAdminRequest<any>(`{publications(first:20){nodes{id name}}}`);
  const onlineStore = pubs.publications.nodes.find((p: any) => p.name === 'Online Store').id;

  for (const s of snap.subCategories) {
    if (existingSubs.has(s.fields.name)) { console.log(`sub-category ${s.fields.name}: exists, skipped`); continue; }
    const fields = [{ key: 'name', value: s.fields.name }, { key: 'category', value: s.fields.category }];
    if (s.fields.relevant_filters) fields.push({ key: 'relevant_filters', value: s.fields.relevant_filters });
    if (apply) {
      const r: any = await shopifyAdminRequest<any>(`mutation($m:MetaobjectCreateInput!){metaobjectCreate(metaobject:$m){metaobject{id} userErrors{field message}}}`,
        { m: { type: 'sub_category', fields } });
      assertNoUserErrors(r.metaobjectCreate.userErrors, `create sub-category ${s.fields.name}`);
    }
    console.log(`${apply ? 'created' : 'would create'} sub-category ${s.fields.name}`);
  }

  for (const c of snap.collections) {
    const ex: any = await shopifyAdminRequest<any>(`query($h:String!){collectionByHandle(handle:$h){id}}`, { h: c.handle });
    if (ex.collectionByHandle) { console.log(`collection ${c.handle}: exists, skipped`); continue; }
    if (apply) {
      const r: any = await shopifyAdminRequest<any>(`mutation($i:CollectionInput!){collectionCreate(input:$i){collection{id} userErrors{field message}}}`,
        { i: { title: c.title, handle: c.handle, ruleSet: c.ruleSet } });
      assertNoUserErrors(r.collectionCreate.userErrors, `create collection ${c.title}`);
      const id = r.collectionCreate.collection.id;
      const p: any = await shopifyAdminRequest<any>(`mutation($id:ID!,$input:[PublicationInput!]!){publishablePublish(id:$id,input:$input){userErrors{field message}}}`,
        { id, input: [{ publicationId: onlineStore }] });
      assertNoUserErrors(p.publishablePublish.userErrors, `publish collection ${c.title}`);
      await setMegaMenuMetafields(id, { navKey: c.menu.menu_nav_key, groupLabel: c.menu.menu_group_label, groupMode: c.menu.menu_group_mode, sortOrder: Number(c.menu.menu_sort_order) });
    }
    console.log(`${apply ? 'created' : 'would create'} collection  ${c.title} (${c.handle}) in menu group ${c.menu.menu_group_label} #${c.menu.menu_sort_order}`);
  }
  if (!apply) console.log('\nDry run only. Re-run with --apply to restore.');
}
main().catch((e) => { console.error(e); process.exit(1); });
