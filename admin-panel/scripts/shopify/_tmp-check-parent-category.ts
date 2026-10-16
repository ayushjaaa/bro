import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = `query {
  cats: metaobjects(type: "category", first: 50) { nodes { id fields { key value } } }
  subs: metaobjects(type: "sub_category", first: 100) { nodes { id fields { key value } } }
}`;
async function main() {
  const data = await shopifyAdminRequest<any>(Q);
  const catMap: any = {};
  for (const n of data.cats.nodes) {
    const f: any = {};
    n.fields.forEach((x:any)=>f[x.key]=x.value);
    catMap[n.id] = f.name;
  }
  const target = ['Rolling Papers','Filters & Tips','Pre-Rolled Cones','Torch Lighters','Disposable Vapes','E-Liquids / Vape Juice','Pre-Filled Pods'];
  for (const n of data.subs.nodes) {
    const f: any = {};
    n.fields.forEach((x:any)=>f[x.key]=x.value);
    if (target.includes(f.name)) {
      console.log(f.name, '-> Category:', catMap[f.category] || f.category);
    }
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
