import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';
// Read-only: for every handle in the export CSV, report status + Online Store publication.
async function main() {
  const handles = [...new Set(readFileSync(process.argv[2], 'utf-8').split('\n').slice(1).map((l) => l.split(',')[0]).filter(Boolean))];
  const pubs: any = await shopifyAdminRequest<any>(`{publications(first:20){nodes{id name}}}`);
  const pub = pubs.publications.nodes.find((n: any) => n.name === 'Online Store').id;
  let ok = 0; const bad: string[] = [];
  for (const h of handles) {
    const r: any = await shopifyAdminRequest<any>(`query($h:String!,$p:ID!){productByHandle(handle:$h){status onl:publishedOnPublication(publicationId:$p)}}`, { h, p: pub });
    const x = r.productByHandle;
    if (x && x.status === 'ACTIVE' && x.onl) ok++; else bad.push(`${h}: ${x ? `${x.status} published=${x.onl}` : 'NOT FOUND'}`);
  }
  console.log(`${ok}/${handles.length} ACTIVE + published on Online Store`); bad.forEach((b) => console.log('  ', b));
}
main().catch((e) => { console.error(e); process.exit(1); });
