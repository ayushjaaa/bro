/**
 * Puts back sections removed by _tmp-remove-sections.ts, from the snapshot taken before removal:
 * recreates each sub_category metaobject (same name, category and filters) and its collection
 * (same title, handle and product_type rule), published to Online Store, with its mega-menu
 * placement. New Shopify IDs are created. Skips anything that already exists. Dry run by default;
 * --apply creates. See REMOVED_SECTIONS.md. Run:
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-restore-sections.ts <snapshot.json> [--apply]
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';
import { setMegaMenuMetafields } from '../../src/lib/shopify/collection-helpers.core';
import { readFileSync } from 'fs';

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes('--apply');
  const snap = JSON.parse(readFileSync(file, 'utf-8'));

  const subsR: any = await shopifyAdminRequest<any>(`{metaobjects(type:"sub_category",first:250){nodes{fields{key value}}}}`);
  const existing = new Set(subsR.metaobjects.nodes.map((n: any) => n.fields.find((f: any) => f.key === 'name')?.value));
  const pubs: any = await shopifyAdminRequest<any>(`{publications(first:20){nodes{id name}}}`);
  const onlineStore = pubs.publications.nodes.find((p: any) => p.name === 'Online Store').id;

  for (const s of snap.subCategories) {
    if (existing.has(s.fields.name)) { console.log(`sub-category ${s.fields.name}: exists, skipped`); continue; }
    const fields = [{ key: 'name', value: s.fields.name }, { key: 'category', value: s.fields.category }];
    if (s.fields.description) fields.push({ key: 'description', value: s.fields.description });
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
      if (c.menu?.menu_nav_key) {
        await setMegaMenuMetafields(id, { navKey: c.menu.menu_nav_key, groupLabel: c.menu.menu_group_label, groupMode: c.menu.menu_group_mode, sortOrder: Number(c.menu.menu_sort_order) });
      }
    }
    console.log(`${apply ? 'created' : 'would create'} collection  ${c.title} (${c.handle})${c.menu?.menu_nav_key ? ` in menu group ${c.menu.menu_group_label} #${c.menu.menu_sort_order}` : ''}`);
  }
  if (!apply) console.log('\nDry run only. Re-run with --apply to restore.');
}
main().catch((e) => { console.error(e); process.exit(1); });
