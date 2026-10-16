import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = /* GraphQL */ `query { subs: metaobjects(type: "sub_category", first: 100) { nodes { id fields { key value } } } filters: metaobjects(type:"filter_definition", first: 100) { nodes { id fields { key value } } } }`;
async function main() {
  const data = await shopifyAdminRequest<any>(Q);
  for (const n of data.subs.nodes) {
    const f: any = {};
    n.fields.forEach((x:any)=>f[x.key]=x.value);
    if (f.name === 'Pre-Rolled Cones' || f.name === 'Torch Lighters') {
      console.log('SUBCAT', n.id, f.name, 'relevant_filters=', f.relevant_filters);
    }
  }
  console.log('---filters map---');
  const fmap: any = {};
  for (const n of data.filters.nodes) {
    const f: any = {};
    n.fields.forEach((x:any)=>f[x.key]=x.value);
    fmap[n.id] = f;
  }
  console.log(JSON.stringify(fmap, null, 0));
}
main().catch(e=>{console.error(e);process.exit(1)});
