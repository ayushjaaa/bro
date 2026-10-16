import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = `query($q: String!) { products(query: $q, first: 20) { nodes { title handle vendor } } }`;
const titles = [
  "Pop Paper 1 1/4 Paper And Flavoured Tips - 24ct",
  "Pop Paper King Size Paper And Flavoured Tips - 24ct",
  "Raw Classic 500's 1 1/4 Size - 20Pk/Box",
  "Raw Classic 300's  1¼ - 40Pk/box",
  "Raw Classic Ethereal King Size Slim Papers - Pack/32 - Box/50",
  "Raw Classic Ethereal 1 1/4 Size Rolling Papers, Pack/50 -  Box/24",
  "Raw Classic 1/2 Size Rolling Papers, Pack/33 - Box/25",
  "Raw Black KS Wide Rolling Papers, Pack/32 - Box/50",
  "Raw Black Organic King Size Slim Rolling Papers, Pack/32 - Box/50",
  "Raw 300’s 1¼ Rolling Papers, Pack/300 - Box/20",
  "Raw Black Organic Hemp 1 1/4 Rolling Papers - Pack/24",
  "Skunk Rolling Papers - 1¼",
  "Juicy Jay Superfine Rolling Papers - 1¼",
];
async function main() {
  for (const t of titles) {
    const words = t.split(/\s+/).slice(0,3).join(' ');
    const data = await shopifyAdminRequest<any>(Q, { q: `title:*${words.replace(/['",]/g,'')}*` });
    console.log(`"${t}" -> ${data.products.nodes.length} matches:`, data.products.nodes.map((n:any)=>n.title));
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
