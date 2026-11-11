import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';
// Read-only: re-read every imported product from Shopify and compare it field by field with the plan.
async function main() {
  const [planFile, lim] = process.argv.slice(2);
  const plan = JSON.parse(readFileSync(planFile, 'utf-8')).slice(0, lim ? +lim : undefined);
  const pubs: any = await shopifyAdminRequest<any>(`{publications(first:20){nodes{id name}}}`);
  const online = pubs.publications.nodes.find((n: any) => n.name === 'Online Store').id;
  let pass = 0; const fails: string[] = [];
  for (const p of plan) {
    const r: any = await shopifyAdminRequest<any>(`query($h:String!,$pub:ID!){productByHandle(handle:$h){title productType vendor status descriptionHtml tags
      onl: publishedOnPublication(publicationId:$pub)
      brand: metafield(namespace:"taxonomy",key:"brand"){reference{... on Metaobject{name: field(key:"name"){value} sub: field(key:"sub_category"){value}}}}
      collections(first:10){nodes{title}} media(first:20){nodes{status}}
      variants(first:50){nodes{sku price compareAtPrice inventoryPolicy selectedOptions{name value} image{url} inventoryItem{tracked} inventoryQuantity}}}}`, { h: p.handle, pub: online });
    const x = r.productByHandle; const e: string[] = [];
    if (!x) { fails.push(`${p.handle}: NOT FOUND`); continue; }
    if (x.title !== p.title) e.push('title');
    if (x.productType !== p.subcategory) e.push(`type ${x.productType}`);
    if (x.status !== 'ACTIVE') e.push(`status ${x.status}`);
    if (!x.onl) e.push('not published');
    if (x.tags.length) e.push(`tags ${x.tags}`);
    if (!x.descriptionHtml?.trim()) e.push('no description');
    if (x.brand?.reference?.name?.value !== p.brand) e.push('brand');
    if (!x.collections.nodes.some((c: any) => c.title === p.subcategory)) e.push(`not in collection (${x.collections.nodes.map((c: any) => c.title)})`);
    if (x.media.nodes.length !== p.images.length || x.media.nodes.some((m: any) => m.status !== 'READY')) e.push(`media ${x.media.nodes.map((m: any) => m.status)}`);
    if (x.variants.nodes.length !== p.variants.length) e.push(`variant count ${x.variants.nodes.length}`);
    for (const v of p.variants) {
      const lv = x.variants.nodes.find((n: any) => n.sku === v.sku);
      if (!lv) { e.push(`missing sku ${v.sku}`); continue; }
      if (Number(lv.price) !== Number(v.price)) e.push(`price ${lv.price}≠${v.price}`);
      if ((v.compareAt ? Number(v.compareAt) : null) !== (lv.compareAtPrice ? Number(lv.compareAtPrice) : null)) e.push('compareAt');
      if (lv.inventoryQuantity !== Math.max(0, v.qty)) e.push(`stock ${lv.inventoryQuantity}≠${v.qty}`);
      if (!lv.inventoryItem.tracked) e.push('not tracked');
      if (lv.selectedOptions[0]?.value !== v.name) e.push(`option ${lv.selectedOptions[0]?.value}`);
      if (v.image && !lv.image) e.push('variant image missing');
    }
    e.length ? fails.push(`${p.handle}: ${e.join('; ')}`) : pass++;
  }
  console.log(`verified ${pass}/${plan.length} OK`); fails.forEach((f) => console.log('  FAIL', f));
}
main().catch((e) => { console.error(e); process.exit(1); });
