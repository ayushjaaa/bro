import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
// Read-only: how an existing live glass product and the Bowls collection are set up, so new ones match.
async function main() {
  for (const h of ['mg-46-14-14-glass-beaker-bong', 'cb-2050-10-glass-bong', 'jdl-231-silicone-bong', 'premium-glass-bowl-14mm-12ct']) {
    const r = await shopifyAdminRequest<any>(`query($h:String!){productByHandle(handle:$h){handle productType vendor tags status options{name}
      metafields(first:30){nodes{namespace key type value}} media(first:3){nodes{alt}}
      collections(first:10){nodes{title}} variants(first:2){nodes{sku inventoryPolicy inventoryItem{tracked} metafields(first:10){nodes{namespace key value}}}}}}`, { h });
    console.log(JSON.stringify(r.productByHandle, null, 0).slice(0, 1500));
  }
  const c = await shopifyAdminRequest<any>(`{collections(first:250){nodes{title handle ruleSet{rules{column relation condition}}
    nav:metafield(namespace:"custom",key:"menu_nav_key"){value} label:metafield(namespace:"custom",key:"menu_group_label"){value}
    mode:metafield(namespace:"custom",key:"menu_group_mode"){value} sort:metafield(namespace:"custom",key:"menu_sort_order"){value}}}}`);
  for (const n of c.collections.nodes) if (n.label?.value === 'Bong Accessories' || /oil pipe attach/i.test(n.title))
    console.log('COLLECTION', n.title, n.handle, JSON.stringify(n.ruleSet?.rules), n.nav?.value, n.label?.value, n.mode?.value, n.sort?.value);
  const subs = await shopifyAdminRequest<any>(`{metaobjects(type:"sub_category",first:250){nodes{id fields{key value}}}}`);
  for (const n of subs.metaobjects.nodes) { const f = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
    if (['Beaker Bong', 'Glass Bong', 'Silicone Bong', 'Dab Rig Bong', 'Bowls', 'Oil Pipe Attachment'].includes(f.name)) console.log('SUB', n.id, f.name, f.category, f.relevant_filters ?? ''); }
}
main().catch((e) => { console.error(e); process.exit(1); });
