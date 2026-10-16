import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = `query { metaobjects(type: "filter_definition", first: 100) { nodes { id fields { key value } } } }`;
async function main() {
  const data = await shopifyAdminRequest<any>(Q);
  for (const n of data.metaobjects.nodes) {
    const f: any = {};
    n.fields.forEach((x:any)=>f[x.key]=x.value);
    if (f.key === 'torch_lighter_pack_display_quantity') console.log(n.id, f.choices);
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
