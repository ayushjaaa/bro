import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';
const Q2 = `query($id: ID!) { product(id: $id) { title resourcePublicationsV2(first: 5) { nodes { publication { name } isPublished } } } }`;
async function main() {
  const h2g = JSON.parse(readFileSync('/Users/ayushjaiswal/Downloads/handle_to_gid_papers.json','utf-8'));
  for (const [handle, id] of Object.entries(h2g)) {
    const data = await shopifyAdminRequest<any>(Q2, { id });
    const pubs = data.product.resourcePublicationsV2.nodes;
    const onlineStore = pubs.find((p:any)=>p.publication.name === 'Online Store');
    console.log(handle, '->', onlineStore ? `published: ${onlineStore.isPublished}` : 'NOT in any publication list');
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
