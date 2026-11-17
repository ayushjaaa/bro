import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';
// Read-only: checks every planned variant against Shopify (SKU, option, price, stock, previous_sku) and the archived listings.
async function main() {
  const plan = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
  const expect = JSON.parse(readFileSync(process.argv[3], 'utf-8')); // handle::option -> {sku, price, qty}
  let okV = 0; const fails: string[] = [];
  for (const [handle, changes] of Object.entries<any[]>(plan.products)) {
    const r = await shopifyAdminRequest<any>(`query($h:String!){productByHandle(handle:$h){status variants(first:100){nodes{sku price inventoryQuantity selectedOptions{value} prev:metafield(namespace:"custom",key:"previous_sku"){value}}}}}`, { h: handle });
    const p = r.productByHandle;
    for (const c of changes) {
      const opt = c.newOption ?? c.option;
      const v = p.variants.nodes.find((n: any) => n.selectedOptions[0]?.value === opt);
      const e = expect[`${handle}::${opt}`]; const bad: string[] = [];
      if (!v) { fails.push(`${handle} / ${opt}: variant missing`); continue; }
      if (v.sku !== e.sku) bad.push(`sku ${v.sku}≠${e.sku}`);
      if (Math.abs(Number(v.price) - Number(e.price)) > 0.001) bad.push(`price ${v.price}≠${e.price}`);
      if (v.inventoryQuantity !== e.qty) bad.push(`stock ${v.inventoryQuantity}≠${e.qty}`);
      if (v.prev?.value !== c.oldSku) bad.push(`previous_sku ${v.prev?.value}`);
      if (p.status !== 'ACTIVE') bad.push(`status ${p.status}`);
      bad.length ? fails.push(`${handle} / ${opt}: ${bad.join('; ')}`) : okV++;
    }
  }
  let arch = 0;
  for (const h of plan.archive) { const r = await shopifyAdminRequest<any>(`query($h:String!){productByHandle(handle:$h){status}}`, { h }); r.productByHandle?.status === 'ARCHIVED' ? arch++ : fails.push(`${h}: not archived`); }
  console.log(`variants OK ${okV}/${Object.values<any[]>(plan.products).flat().length}, archived ${arch}/${plan.archive.length}`);
  fails.slice(0, 20).forEach((f) => console.log('  FAIL', f));
}
main().catch((e) => { console.error(e); process.exit(1); });
