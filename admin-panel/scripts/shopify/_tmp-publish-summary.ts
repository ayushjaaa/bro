import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';
const Q = `query { products(query: "product_type:'Pre-Rolled Cones' OR product_type:'Torch Lighters' OR product_type:'Disposable Vapes' OR product_type:'E-Liquids / Vape Juice' OR product_type:'Pre-Filled Pods' OR product_type:'Rolling Papers' OR product_type:'Filters & Tips'", first: 1) { nodes { id } } }`;
async function main() {
  const h2g1 = JSON.parse(readFileSync('/Users/ayushjaiswal/Downloads/handle_to_gid.json','utf-8'));
  const h2g2 = JSON.parse(readFileSync('/Users/ayushjaiswal/Downloads/handle_to_gid_papers.json','utf-8'));
  console.log('Batch 1 (cones/lighters/vapes):', Object.keys(h2g1).length, 'products');
  console.log('Batch 2 (rolling papers/filters&tips):', Object.keys(h2g2).length, 'products');
  console.log('Total:', Object.keys(h2g1).length + Object.keys(h2g2).length);
}
main().catch(e=>{console.error(e);process.exit(1)});
