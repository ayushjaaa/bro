import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
// Read-only: the Cannabis Accessories mega-menu as configured in Shopify (group -> section, sort, product count).
async function main() {
  const c = await shopifyAdminRequest<any>(`{collections(first:250){nodes{title productsCount{count}
    nav:metafield(namespace:"custom",key:"menu_nav_key"){value} label:metafield(namespace:"custom",key:"menu_group_label"){value}
    sort:metafield(namespace:"custom",key:"menu_sort_order"){value}}}}`);
  const rows = c.collections.nodes.filter((n: any) => n.nav?.value === 'cannabis-accessories')
    .map((n: any) => ({ g: n.label?.value ?? '(no group)', t: n.title, s: Number(n.sort?.value ?? 999), n: n.productsCount.count }));
  const groups = new Map<string, any[]>();
  for (const r of rows) { if (!groups.has(r.g)) groups.set(r.g, []); groups.get(r.g)!.push(r); }
  const ordered = [...groups.entries()].sort((a, b) => Math.min(...a[1].map((x) => x.s)) - Math.min(...b[1].map((x) => x.s)));
  for (const [g, rs] of ordered) { console.log(`[${g}]`); for (const r of rs.sort((a, b) => a.s - b.s)) console.log(`    ${r.s}. ${r.t}: ${r.n} products${r.n === 0 ? '   <-- EMPTY' : ''}`); }
}
main().catch((e) => { console.error(e); process.exit(1); });
