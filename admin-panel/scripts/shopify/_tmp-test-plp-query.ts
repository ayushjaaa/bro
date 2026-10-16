import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = `query($q: String!) { products(query: $q, first: 10) { nodes { title vendor productType tags } } }`;
async function run(label: string, query: string) {
  const data = await shopifyAdminRequest<any>(Q, { q: query });
  console.log(`\n=== ${label} (query: ${query}) -> ${data.products.nodes.length} results ===`);
  data.products.nodes.forEach((n: any) => console.log(' -', n.title, '| vendor:', n.vendor, '| type:', n.productType, '| tags:', n.tags));
}
async function main() {
  await run('Cones, no filter', `product_type:'Pre-Rolled Cones'`);
  await run('Cones + brand RAW', `product_type:'Pre-Rolled Cones' AND vendor:'RAW'`);
  await run('Lighters, no filter', `product_type:'Torch Lighters'`);
  await run('Lighters + brand Soul', `product_type:'Torch Lighters' AND vendor:'Soul'`);
}
main().catch(e=>{console.error(e);process.exit(1)});
