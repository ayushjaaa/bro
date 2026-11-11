import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
// Read-only: Cannabis Accessories sub-categories, their brands, filters, and menu placement.
const CANNABIS = 'gid://shopify/Metaobject/252082094278';
async function all(type: string) { const o: any[] = []; let a: string | null = null;
  do { const r: any = await shopifyAdminRequest<any>(`query($a:String){metaobjects(type:"${type}",first:250,after:$a){pageInfo{hasNextPage endCursor} nodes{id fields{key value}}}}`, { a });
    o.push(...r.metaobjects.nodes.map((n: any) => ({ id: n.id, ...Object.fromEntries(n.fields.map((f: any) => [f.key, f.value])) })));
    a = r.metaobjects.pageInfo.hasNextPage ? r.metaobjects.pageInfo.endCursor : null; } while (a); return o; }
async function main() {
  const [subs, brands, filters] = await Promise.all([all('sub_category'), all('brand'), all('filter_definition')]);
  const fmap = Object.fromEntries(filters.map((f) => [f.id, f]));
  const cols: any = await shopifyAdminRequest<any>(`{collections(first:250){nodes{title nav:metafield(namespace:"custom",key:"menu_nav_key"){value} label:metafield(namespace:"custom",key:"menu_group_label"){value} sort:metafield(namespace:"custom",key:"menu_sort_order"){value}}}}`);
  const menu = Object.fromEntries(cols.collections.nodes.map((c: any) => [c.title, `${c.nav?.value ?? '-'} / ${c.label?.value ?? '-'} / ${c.sort?.value ?? '-'}`]));
  for (const s of subs.filter((s) => s.category === CANNABIS)) {
    const b = brands.filter((x) => x.sub_category === s.id).map((x) => x.name);
    const f = (JSON.parse(s.relevant_filters ?? '[]') as string[]).map((id) => fmap[id] ? `${fmap[id].label ?? fmap[id].name}[${fmap[id].key ?? fmap[id].metafield_key ?? ''}]` : id);
    console.log(`${s.name} | menu: ${menu[s.name] ?? 'NO COLLECTION'} | brands: ${b.join(', ') || '-'} | filters: ${f.join(', ') || '-'}`);
  }
  console.log('filter_definition field keys:', Object.keys(filters[0] ?? {}).join(','));
}
main().catch((e) => { console.error(e); process.exit(1); });
