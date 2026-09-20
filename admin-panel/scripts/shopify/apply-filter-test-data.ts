/**
 * Re-assigns the custom.disposable_vape_* filter metafields on the Federal load-test Disposable Vape
 * products so EVERY filter value (and a wide spread of value combinations) has products, instead of
 * the earlier data where Puff Count was only 30000/empty and Nicotine only 20mg/0mg/empty (35mg,
 * 50mg, Rechargeable, 10-Pack... matched nothing, so tests on them could never fail).
 *
 * Rules: values that are really in the product title (e.g. "20mg", "60K", "40000 Puffs", "5CT") are
 * kept; everything else is filled by a mixed-radix walk over the choice lists, so combinations are
 * spread (about 2000 distinct combinations for ~1600 products). A few products get a field left
 * EMPTY on purpose to test "product with no value for this filter".
 *
 * Also extends the Puff Count choice list (definition validation + filter_definition metaobject).
 * Only touches products tagged `loadtest` + region-federal + product type "Standard Disposable Vapes".
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/apply-filter-test-data.ts [--dry-run]
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const DRY = process.argv.includes('--dry-run');

const PUFF = ['600', '2000', '5000', '7000', '10000', '15000', '20000', '25000', '30000', '40000', '60000', '80000', '100000', '120000'];
const NIC = ['0mg', '20mg', '35mg', '50mg'];
const TYPE = ['Freebase', 'Nicotine Salt', 'Nicotine-Free'];
const DEV = ['Standard Disposable', 'Rechargeable Disposable', 'Mesh Coil'];
const PACK = ['Single', '5-Pack', '10-Pack', 'Display Box'];

const K = {
  puff: 'disposable_vape_puff_count',
  nic: 'disposable_vape_nicotine_strength',
  type: 'disposable_vape_nicotine_type',
  dev: 'disposable_vape_device_type',
  pack: 'disposable_vape_pack_quantity',
} as const;

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  for (let a = 1; ; a++) {
    try { return await fn(); } catch (e) { if (a >= 12) throw e; await new Promise((r) => setTimeout(r, 1500 * a)); }
  }
}
const gql = <T = any>(q: string, v?: any) => retry(() => shopifyAdminRequest<T>(q, v));

function nearest(n: number, list: string[]) {
  return list.reduce((b, c) => (Math.abs(+c - n) < Math.abs(+b - n) ? c : b), list[0]);
}
function titleValues(title: string) {
  const t = title.replace(/^\d+/, '');
  let puff: string | undefined, nic: string | undefined, pack: string | undefined;
  const k = t.match(/(\d+)\s*[kK]\b/);
  const pf = t.match(/(\d{4,6})\s*puffs/i);
  if (pf) puff = nearest(+pf[1], PUFF);
  else if (k) puff = nearest(+k[1] * 1000, PUFF);
  const mg = t.match(/(\d+)\s*mg/i);
  if (mg) nic = nearest(+mg[1], NIC);
  if (/\b5\s*(pc|pcs|ct)\b/i.test(t)) pack = '5-Pack';
  return { puff, nic, pack };
}

async function extendPuffChoices() {
  const defs = await gql(`query { metaobjects(type: "filter_definition", first: 250) { nodes { id fields { key value } } } }`);
  const node = defs.metaobjects.nodes.find((n: any) => n.fields.some((f: any) => f.key === 'key' && f.value === K.puff));
  if (!node) throw new Error('puff filter_definition not found');
  const json = JSON.stringify(PUFF);
  if (DRY) { console.log('would set puff choices:', json); return; }
  const u1 = await gql(`mutation($id: ID!, $m: MetaobjectUpdateInput!) { metaobjectUpdate(id: $id, metaobject: $m) { userErrors { message } } }`, { id: node.id, m: { fields: [{ key: 'choices', value: json }] } });
  if (u1.metaobjectUpdate.userErrors.length) throw new Error(JSON.stringify(u1.metaobjectUpdate.userErrors));
  const u2 = await gql(`mutation($d: MetafieldDefinitionUpdateInput!) { metafieldDefinitionUpdate(definition: $d) { userErrors { message } } }`, { d: { key: K.puff, namespace: 'custom', ownerType: 'PRODUCT', validations: [{ name: 'choices', value: json }] } });
  if (u2.metafieldDefinitionUpdate.userErrors.length) throw new Error(JSON.stringify(u2.metafieldDefinitionUpdate.userErrors));
  console.log('puff choices extended to', PUFF.length, 'values');
}

async function main() {
  await extendPuffChoices();

  const items: Array<{ id: string; title: string }> = [];
  let after: string | undefined;
  for (;;) {
    const d = await gql(`query($after: String) { products(query: "tag:loadtest AND tag:region-federal AND product_type:\\"Standard Disposable Vapes\\"", first: 100, after: $after, sortKey: ID) { pageInfo { hasNextPage endCursor } nodes { id title } } }`, { after });
    items.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }
  console.log(items.length, 'products to assign');

  const sets: Array<{ ownerId: string; namespace: string; key: string; type: string; value: string }> = [];
  const dels: Array<{ ownerId: string; namespace: string; key: string }> = [];
  const tally: Record<string, Record<string, number>> = {};
  const count = (f: string, v: string) => { tally[f] ??= {}; tally[f][v] = (tally[f][v] ?? 0) + 1; };

  items.forEach((p, i) => {
    const tv = titleValues(p.title);
    let x = i;
    const walk = (n: number) => { const r = x % n; x = Math.floor(x / n); return r; };
    const v = {
      puff: tv.puff ?? PUFF[walk(PUFF.length)],
      nic: tv.nic ?? NIC[walk(NIC.length)],
      type: TYPE[walk(TYPE.length)],
      dev: DEV[walk(DEV.length)],
      pack: tv.pack ?? PACK[walk(PACK.length)],
    } as Record<keyof typeof K, string | undefined>;
    // Deliberately empty fields (every 23rd -> no nicotine value, every 29th -> no puff value, every 37th -> no pack value).
    if (i % 23 === 0) v.nic = undefined;
    if (i % 29 === 0) v.puff = undefined;
    if (i % 37 === 0) v.pack = undefined;
    for (const f of Object.keys(K) as Array<keyof typeof K>) {
      const val = v[f];
      count(f, val ?? '(empty)');
      if (val === undefined) dels.push({ ownerId: p.id, namespace: 'custom', key: K[f] });
      else sets.push({ ownerId: p.id, namespace: 'custom', key: K[f], type: 'single_line_text_field', value: val });
    }
  });
  console.log(JSON.stringify(tally, null, 1));
  if (DRY) return;

  for (let i = 0; i < sets.length; i += 25) {
    const r = await gql(`mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }`, { m: sets.slice(i, i + 25) });
    if (r.metafieldsSet.userErrors.length) throw new Error(JSON.stringify(r.metafieldsSet.userErrors));
    if ((i / 25) % 20 === 0) console.log(`  set ${Math.min(i + 25, sets.length)}/${sets.length}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  for (let i = 0; i < dels.length; i += 25) {
    const r = await gql(`mutation($m: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $m) { userErrors { message } } }`, { m: dels.slice(i, i + 25) });
    if (r.metafieldsDelete.userErrors.length) throw new Error(JSON.stringify(r.metafieldsDelete.userErrors));
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`Done. set ${sets.length}, cleared ${dels.length}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
