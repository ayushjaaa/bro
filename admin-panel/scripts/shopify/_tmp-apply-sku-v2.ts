/**
 * Applies the client's SKU v2 (16 Nov 2026) to the live glass/silicone catalogue:
 *  - renames each live variant's SKU to the new one (matched by handle + option value, since some
 *    live SKUs came from a later client file than the 6 Nov one the old->new list is keyed on)
 *  - renames the 2 FLAME designs the client renamed
 *  - keeps the old SKU in a variant metafield custom.previous_sku
 *  - sets stock / price where the new file differs
 *  - archives the 7 listings the client merged into others
 * Plan comes from sku_v2_apply_plan.json (built from the client's Shopify Import sheet + live dump).
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-apply-sku-v2.ts <plan.json> [--only handle] [--dry-run]
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

const LOCATION_ID = 'gid://shopify/Location/84994621638';
type Change = { option: string; newOption?: string; oldSku: string; newSku: string; price?: string; qty?: number };
type Plan = { products: Record<string, Change[]>; archive: string[] };

const ok = (errs: any[] | undefined, what: string) => { if (errs?.length) throw new Error(`${what}: ${JSON.stringify(errs)}`); };

async function applyProduct(handle: string, changes: Change[], dry: boolean) {
  const r = await shopifyAdminRequest<any>(`query($h:String!){productByHandle(handle:$h){id options{id name optionValues{id name}}
    variants(first:100){nodes{id sku price inventoryQuantity selectedOptions{name value} inventoryItem{id}}}}}`, { h: handle });
  const p = r.productByHandle;
  if (!p) throw new Error('product not found');
  const variants: any[] = []; const adjust: any[] = []; const log: string[] = [];
  for (const c of changes) {
    const v = p.variants.nodes.find((n: any) => (n.selectedOptions[0]?.value ?? '') === c.option)
      ?? p.variants.nodes.find((n: any) => n.sku === c.newSku);
    if (!v) throw new Error(`variant "${c.option}" not found`);
    if (c.qty !== undefined && c.qty !== v.inventoryQuantity) {
      // 2026-07 requires changeFromQuantity (optimistic check against the quantity we just read).
      adjust.push({ inventoryItemId: v.inventoryItem.id, locationId: LOCATION_ID, delta: c.qty - v.inventoryQuantity, changeFromQuantity: v.inventoryQuantity });
      log.push(`stock ${c.option} ${v.inventoryQuantity}->${c.qty}`);
    }
    if (v.sku === c.newSku) continue; // SKU already applied on an earlier run
    if (v.sku !== c.oldSku) throw new Error(`variant "${c.option}" SKU is ${v.sku}, expected ${c.oldSku} -- refusing`);
    const input: any = {
      id: v.id,
      inventoryItem: { sku: c.newSku },
      metafields: [{ namespace: 'custom', key: 'previous_sku', type: 'single_line_text_field', value: c.oldSku }],
    };
    if (c.price !== undefined) input.price = c.price;
    if (c.newOption) input.optionValues = [{ optionName: v.selectedOptions[0].name, name: c.newOption }];
    variants.push(input);
  }
  if (dry) return { handle, variants: variants.length, adjust: adjust.length, log };
  if (variants.length) {
  const u = await shopifyAdminRequest<any>(`mutation($pid:ID!,$v:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$pid,variants:$v){userErrors{field message}}}`,
    { pid: p.id, v: variants });
  ok(u.productVariantsBulkUpdate.userErrors, 'productVariantsBulkUpdate');
  }
  if (adjust.length) {
    // 2026-07 also requires @idempotent: a retried request with the same key is applied only once.
    const a = await shopifyAdminRequest<any>(`mutation($i:InventoryAdjustQuantitiesInput!,$k:String!){inventoryAdjustQuantities(input:$i) @idempotent(key:$k){userErrors{field message}}}`,
      { i: { reason: 'correction', name: 'available', changes: adjust }, k: randomUUID() });
    ok(a.inventoryAdjustQuantities.userErrors, 'inventoryAdjustQuantities');
  }
  return { handle, variants: variants.length, adjust: adjust.length, log };
}

async function main() {
  const [planFile, ...rest] = process.argv.slice(2);
  const dry = rest.includes('--dry-run');
  const oi = rest.indexOf('--only'); const only = oi >= 0 ? rest[oi + 1] : null;
  const plan: Plan = JSON.parse(readFileSync(planFile, 'utf-8'));
  const results: any[] = [];
  for (const [handle, changes] of Object.entries(plan.products)) {
    if (only && handle !== only) continue;
    try { const r = await applyProduct(handle, changes, dry); results.push({ ...r, status: 'ok' }); }
    catch (e: any) { results.push({ handle, status: 'FAILED', error: String(e.message ?? e) }); console.log(`FAILED ${handle}: ${e.message ?? e}`); }
  }
  if (!only) {
    for (const handle of plan.archive) {
      try {
        const r = await shopifyAdminRequest<any>(`query($h:String!){productByHandle(handle:$h){id status}}`, { h: handle });
        const p = r.productByHandle;
        if (!p) throw new Error('not found');
        if (!dry && p.status !== 'ARCHIVED') {
          const u = await shopifyAdminRequest<any>(`mutation($i:ProductUpdateInput!){productUpdate(product:$i){userErrors{field message}}}`, { i: { id: p.id, status: 'ARCHIVED' } });
          ok(u.productUpdate.userErrors, 'archive');
        }
        results.push({ handle, status: dry ? 'would archive' : 'archived' });
      } catch (e: any) { results.push({ handle, status: 'FAILED', error: String(e.message ?? e) }); console.log(`FAILED archive ${handle}: ${e.message ?? e}`); }
    }
  }
  writeFileSync(planFile.replace(/\.json$/, dry ? '.dry.json' : '.results.json'), JSON.stringify(results, null, 2));
  const c = (s: string) => results.filter((r) => r.status === s).length;
  console.log(`products ok ${c('ok')}, archived ${c('archived') + c('would archive')}, failed ${c('FAILED')}, variants ${results.reduce((n, r) => n + (r.variants || 0), 0)}, stock changes ${results.reduce((n, r) => n + (r.adjust || 0), 0)}${dry ? ' (DRY RUN)' : ''}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
