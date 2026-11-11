import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
// Read-only: list taxonomy metaobject types + their entries, and collections.
async function main() {
  const d: any = await shopifyAdminRequest<any>(`{metaobjectDefinitions(first:50){nodes{type name fieldDefinitions{key type{name}}}}}`);
  for (const def of d.metaobjectDefinitions.nodes) {
    if (def.type === 'brand') { console.log('TYPE brand fields', def.fieldDefinitions.map((f: any) => f.key)); continue; }
    const r: any = await shopifyAdminRequest<any>(`query($t:String!){metaobjects(type:$t,first:250){nodes{id handle fields{key value}}}}`, { t: def.type });
    console.log(`TYPE ${def.type} (${def.name}) fields`, def.fieldDefinitions.map((f: any) => `${f.key}:${f.type.name}`));
    for (const n of r.metaobjects.nodes) console.log('   ', n.id, JSON.stringify(Object.fromEntries(n.fields.map((f: any) => [f.key, f.value]))).slice(0, 200));
  }
  const c: any = await shopifyAdminRequest<any>(`{collections(first:250){nodes{id title handle ruleSet{appliedDisjunctively rules{column relation condition}}}}}`);
  for (const n of c.collections.nodes) console.log('COLL', n.title, '|', n.handle, '|', JSON.stringify(n.ruleSet?.rules ?? 'manual'));
}
main().catch((e) => { console.error(e); process.exit(1); });
