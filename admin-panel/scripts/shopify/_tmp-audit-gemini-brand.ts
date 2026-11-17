import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
// Read-only: which brand entries are called "Gemini Distribution" / "Unbranded", which section each sits in,
// and how many products point at each (via taxonomy.brand) plus their vendor text.
async function main() {
  const subs = await shopifyAdminRequest<any>(`{metaobjects(type:"sub_category",first:250){nodes{id fields{key value}}}}`);
  const subName = Object.fromEntries(subs.metaobjects.nodes.map((n: any) => [n.id, n.fields.find((f: any) => f.key === 'name')?.value]));
  const b = await shopifyAdminRequest<any>(`{metaobjects(type:"brand",first:250){nodes{id fields{key value}}}}`);
  const target = new Map<string, { name: string; sub: string }>();
  for (const n of b.metaobjects.nodes) { const f = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
    if (/^(gemini distribution|unbranded)$/i.test(f.name ?? '')) target.set(n.id, { name: f.name, sub: subName[f.sub_category] ?? f.sub_category }); }
  const count = new Map<string, number>(); const vendors = new Map<string, Set<string>>(); let after: string | null = null; let otherVendorGD = 0;
  do {
    const r: any = await shopifyAdminRequest<any>(`query($a:String){products(first:250,after:$a){pageInfo{hasNextPage endCursor} nodes{vendor status brand:metafield(namespace:"taxonomy",key:"brand"){value}}}}`, { a: after });
    for (const p of r.products.nodes) {
      const id = p.brand?.value;
      if (id && target.has(id)) { count.set(id, (count.get(id) ?? 0) + 1); if (!vendors.has(id)) vendors.set(id, new Set()); vendors.get(id)!.add(`${p.vendor}/${p.status}`); }
      else if (p.vendor === 'Gemini Distribution') otherVendorGD++;
    }
    after = r.products.pageInfo.hasNextPage ? r.products.pageInfo.endCursor : null;
  } while (after);
  for (const [id, t] of target) console.log(`${t.name} | section: ${t.sub} | products: ${count.get(id) ?? 0} | vendor/status: ${[...(vendors.get(id) ?? [])].join(', ')} | ${id}`);
  console.log('products with vendor "Gemini Distribution" but a different brand entry:', otherVendorGD);
}
main().catch((e) => { console.error(e); process.exit(1); });
