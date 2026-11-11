/**
 * Brings the 31 already-live glass products in line with the client's revised export
 * (Gemini_Distribution_Shopify_Export (4).csv): adds the variants the file has that the live product
 * doesn't, and sets each live variant's stock to the file's count (the client's handwritten count).
 * Stock is set with changeFromQuantity = the quantity just read, so a sale landing in between makes
 * that one update fail instead of being silently overwritten. Idempotent. Run:
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-sync-live-glass.ts <export.csv>
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const INVENTORY_LOCATION_ID = 'gid://shopify/Location/84994621638';

/** Minimal RFC-4180 CSV parser (quoted fields, doubled quotes, newlines inside quotes). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [hdr, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(hdr.map((h, i) => [h.replace(/^﻿/, ''), r[i] ?? ''])));
}

async function main() {
  const rows = parseCsv(readFileSync(process.argv[2], 'utf-8'));
  const byHandle = new Map<string, Record<string, string>[]>();
  for (const r of rows) if (r['Variant SKU'].trim()) byHandle.set(r.Handle, [...(byHandle.get(r.Handle) ?? []), r]);

  let added = 0, stockSet = 0, same = 0;
  for (const [handle, variants] of byHandle) {
    const res: any = await shopifyAdminRequest<any>(`query($h:String!){productByHandle(handle:$h){id createdAt options{name}
      variants(first:100){nodes{sku inventoryQuantity inventoryItem{id}}}}}`, { h: handle });
    const p = res.productByHandle;
    if (!p) continue;
    const live = new Map<string, any>(p.variants.nodes.map((v: any) => [v.sku, v]));
    const optionName = p.options[0].name;

    const toAdd = variants.filter((v) => !live.has(v['Variant SKU'].trim()));
    if (toAdd.length) {
      const r: any = await shopifyAdminRequest<any>(`mutation($id:ID!,$v:[ProductVariantsBulkInput!]!){productVariantsBulkCreate(productId:$id,variants:$v){productVariants{sku} userErrors{field message}}}`, {
        id: p.id,
        v: toAdd.map((v) => ({
          optionValues: [{ name: v['Option1 Value'], optionName }],
          price: v['Variant Price'],
          inventoryItem: { sku: v['Variant SKU'].trim(), tracked: true },
          inventoryQuantities: [{ availableQuantity: Math.max(0, +v['Variant Inventory Qty']), locationId: INVENTORY_LOCATION_ID }],
          inventoryPolicy: 'DENY',
        })),
      });
      assertNoUserErrors(r.productVariantsBulkCreate.userErrors, `add variants ${handle}`);
      for (const v of toAdd) console.log(`added    ${handle} / ${v['Option1 Value']} (stock ${v['Variant Inventory Qty']})`);
      added += toAdd.length;
    }

    for (const v of variants) {
      const lv = live.get(v['Variant SKU'].trim());
      if (!lv) continue;
      const want = Math.max(0, +v['Variant Inventory Qty']);
      if (lv.inventoryQuantity === want) { same++; continue; }
      const r: any = await shopifyAdminRequest<any>(`mutation($i:InventorySetQuantitiesInput!,$k:String!){inventorySetQuantities(input:$i) @idempotent(key:$k){userErrors{field message}}}`, {
        k: randomUUID(),
        i: { name: 'available', reason: 'correction', quantities: [{ inventoryItemId: lv.inventoryItem.id, locationId: INVENTORY_LOCATION_ID, quantity: want, changeFromQuantity: lv.inventoryQuantity }] },
      });
      assertNoUserErrors(r.inventorySetQuantities.userErrors, `stock ${handle}`);
      console.log(`stock    ${handle} / ${v['Option1 Value']}: ${lv.inventoryQuantity} -> ${want}`);
      stockSet++;
    }
  }
  console.log(`\nDone: ${added} variants added, ${stockSet} stock updated, ${same} already matched.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
