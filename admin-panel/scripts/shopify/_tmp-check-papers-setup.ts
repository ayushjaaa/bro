import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = /* GraphQL */ `query {
  subs: metaobjects(type: "sub_category", first: 100) { nodes { id fields { key value } } }
  brands: metaobjects(type: "brand", first: 250) { nodes { id fields { key value } } }
  filters: metaobjects(type: "filter_definition", first: 100) { nodes { id fields { key value } } }
}`;
async function main() {
  const data = await shopifyAdminRequest<any>(Q);
  console.log('--- sub_categories ---');
  const subMap: any = {};
  for (const n of data.subs.nodes) {
    const f: any = {};
    n.fields.forEach((x:any)=>f[x.key]=x.value);
    subMap[f.name] = n.id;
    if (f.name === 'Rolling Papers' || f.name === 'Filters & Tips') {
      console.log(n.id, f.name, 'relevant_filters=', f.relevant_filters);
    }
  }
  console.log('\n--- brands under Rolling Papers / Filters & Tips ---');
  for (const n of data.brands.nodes) {
    const f: any = {};
    n.fields.forEach((x:any)=>f[x.key]=x.value);
    if (f.sub_category === subMap['Rolling Papers'] || f.sub_category === subMap['Filters & Tips']) {
      console.log(n.id, f.name, '| parent:', f.sub_category);
    }
  }
  console.log('\n--- relevant filter_definitions ---');
  for (const n of data.filters.nodes) {
    const f: any = {};
    n.fields.forEach((x:any)=>f[x.key]=x.value);
    if (f.key && (f.key.startsWith('rolling_paper') || f.key.startsWith('filter_tip'))) {
      console.log(n.id, f.key, f.label, f.choices);
    }
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
