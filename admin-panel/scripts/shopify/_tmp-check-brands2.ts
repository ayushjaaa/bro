import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = /* GraphQL */ `query { brands: metaobjects(type: "brand", first: 250) { nodes { id fields { key value } } } }`;
async function main() {
  const data = await shopifyAdminRequest<any>(Q);
  for (const n of data.brands.nodes) {
    const f: any = {};
    n.fields.forEach((x:any)=>f[x.key]=x.value);
    console.log(n.id, '|', f.name, '| parent:', f.sub_category || f.parent || JSON.stringify(f));
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
