import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';
// Read-only: for each handle in a JSON array file, is the product ACTIVE and published on the Online Store channel?
async function main() {
  const handles: string[] = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
  const pubs = await shopifyAdminRequest<any>(`{publications(first:20){nodes{id name}}}`);
  const online = pubs.publications.nodes.find((n: any) => n.name === 'Online Store').id;
  const bad: string[] = []; let ok = 0;
  for (const h of handles) {
    const r = await shopifyAdminRequest<any>(`query($h:String!,$p:ID!){productByHandle(handle:$h){status onl:publishedOnPublication(publicationId:$p)}}`, { h, p: online });
    const p = r.productByHandle;
    if (!p) bad.push(`${h}: not found`); else if (p.status !== 'ACTIVE' || !p.onl) bad.push(`${h}: status ${p.status}, published ${p.onl}`); else ok++;
  }
  console.log(`active + published on Online Store: ${ok}/${handles.length}`); bad.forEach((b) => console.log('  ', b));
}
main().catch((e) => { console.error(e); process.exit(1); });
