import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';

const Q = `query($id: ID!) {
  product(id: $id) {
    title productType vendor tags
    media(first: 5) { nodes { ... on MediaImage { status } } }
    variants(first: 10) { nodes { price } }
    customMetafields: metafields(first: 20, namespace: "custom") { nodes { key value } }
    brandMf: metafield(namespace: "taxonomy", key: "brand") { reference { ... on Metaobject { fields { key value } } } }
  }
}`;

type PlanProduct = { handle: string; subcategory: string; brand: string; filterValues: Record<string,string> };

async function main() {
  const plan: PlanProduct[] = JSON.parse(readFileSync('/Users/ayushjaiswal/Downloads/import_plan_papers.json', 'utf-8'));
  const handleToGid: Record<string,string> = JSON.parse(readFileSync('/Users/ayushjaiswal/Downloads/handle_to_gid_papers.json','utf-8'));
  let clean = 0;
  for (const p of plan) {
    const id = handleToGid[p.handle];
    const data = await shopifyAdminRequest<any>(Q, { id });
    const prod = data.product;
    const issues: string[] = [];
    if (prod.productType !== p.subcategory) issues.push(`productType "${prod.productType}" != "${p.subcategory}"`);
    if (prod.vendor !== p.brand) issues.push(`vendor "${prod.vendor}" != "${p.brand}"`);
    const brandName = prod.brandMf?.reference?.fields?.find((f:any)=>f.key==='name')?.value;
    if (brandName !== p.brand) issues.push(`brand ref "${brandName}" != "${p.brand}"`);
    const media = prod.media.nodes;
    if (media.length === 0 || !media.every((m:any)=>m.status==='READY')) issues.push('image issue');
    if (prod.variants.nodes.length === 0 || !prod.variants.nodes.every((v:any)=>parseFloat(v.price)>0)) issues.push('price issue');
    if (prod.tags.some((t:string)=>t.startsWith('region-'))) issues.push('unexpected region tag');
    const cmf: Record<string,string> = {};
    prod.customMetafields.nodes.forEach((n:any)=>cmf[n.key]=n.value);
    for (const [k,v] of Object.entries(p.filterValues)) {
      if (cmf[k] !== v) issues.push(`filter ${k}: got "${cmf[k]}" expected "${v}"`);
    }
    if (issues.length) console.log(`ISSUE ${p.handle}: ${issues.join(' | ')}`);
    else clean++;
  }
  console.log(`\nTotal: ${plan.length}, clean: ${clean}`);
}
main().catch(e=>{console.error(e);process.exit(1)});
