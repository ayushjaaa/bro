import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
// Read-only: print mega-menu metafields on every collection.
async function main() {
  const r: any = await shopifyAdminRequest<any>(`{collections(first:250){nodes{title productsCount{count} metafields(first:20){nodes{namespace key value}}}}}`);
  const rows = r.collections.nodes.map((n: any) => ({ t: n.title, c: n.productsCount.count, m: Object.fromEntries(n.metafields.nodes.map((x: any) => [x.key, x.value])) }));
  rows.sort((a: any, b: any) => `${a.m.menu_nav_key}${a.m.menu_group_label}${(+a.m.menu_sort_order||0).toString().padStart(4,'0')}`.localeCompare(`${b.m.menu_nav_key}${b.m.menu_group_label}${(+b.m.menu_sort_order||0).toString().padStart(4,'0')}`));
  for (const x of rows) console.log(`${x.m.menu_nav_key ?? '-'} | ${x.m.menu_group_label ?? '-'} | ${x.m.menu_group_mode ?? '-'} | ${x.m.menu_sort_order ?? '-'} | ${x.t} (${x.c})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
