import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = /* GraphQL */ `query {
  cats: metaobjects(type: "category", first: 50) { nodes { id fields { key value } } }
  subs: metaobjects(type: "sub_category", first: 100) { nodes { id fields { key value } } }
  brands: metaobjects(type: "brand", first: 250) { nodes { id fields { key value } } }
  filters: metaobjects(type: "filter_definition", first: 100) { nodes { id fields { key value } } }
}`;
async function main() {
  const data = await shopifyAdminRequest<any>(Q);
  console.log("CATEGORIES:", data.cats.nodes.length);
  data.cats.nodes.forEach((n:any)=>console.log(' -', JSON.stringify(n.fields)));
  console.log("\nSUB-CATEGORIES:", data.subs.nodes.length);
  data.subs.nodes.forEach((n:any)=>console.log(' -', JSON.stringify(n.fields)));
  console.log("\nBRANDS:", data.brands.nodes.length);
  console.log("\nFILTER DEFINITIONS:", data.filters.nodes.length);
  data.filters.nodes.forEach((n:any)=>console.log(' -', JSON.stringify(n.fields)));
}
main().catch(e=>{console.error(e);process.exit(1)});
