/**
 * Writes E2E_FILTER_EXPECTED.md at the repo root straight from Shopify Admin API data (NOT from
 * the storefront's own query code), so it is an independent ground truth for the click walkthrough
 * in storefront/e2e/loadtest-real-clicks.spec.ts.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/generate-expected-filter-table.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const Q = /* GraphQL */ `
  query($after: String) {
    products(query: "product_type:\\"Disposable Vapes\\" AND tag:\\"region-federal\\"", first: 50, after: $after, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        vendor
        productType
        status
        tags
        totalInventory
        variantsCount { count }
        resourcePublications(first: 5) { nodes { publication { name } } }
        puff: metafield(namespace: "custom", key: "disposable_vape_puff_count") { value }
        nic: metafield(namespace: "custom", key: "disposable_vape_nicotine_strength") { value }
        dev: metafield(namespace: "custom", key: "disposable_vape_device_type") { value }
      }
    }
  }
`;

interface P {
  title: string;
  handle: string;
  vendor: string;
  status: string;
  online: boolean;
  variants: number;
  stock: number;
  puff?: string;
  nic?: string;
  dev?: string;
}

async function fetchAll(): Promise<P[]> {
  const all: P[] = [];
  let after: string | undefined;
  for (;;) {
    let data: any;
    for (let a = 1; a <= 12; a++) {
      try { data = await shopifyAdminRequest<any>(Q, { after }); break; }
      catch (e) { if (a === 12) throw e; await new Promise((r) => setTimeout(r, 2000 * a)); }
    }
    for (const n of data.products.nodes) {
      all.push({
        title: n.title,
        handle: n.handle,
        vendor: n.vendor,
        status: n.status,
        online: n.resourcePublications.nodes.some((x: any) => x.publication.name === 'Online Store'),
        variants: n.variantsCount.count,
        stock: n.totalInventory,
        puff: n.puff?.value,
        nic: n.nic?.value,
        dev: n.dev?.value,
      });
    }
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return all;
}

const P_ = 'puff', N_ = 'nic', D_ = 'dev';
const STEPS: Array<{ step: string; action: string; test: (p: P) => boolean }> = [
  { step: '2', action: 'VAPE > Disposable Vapes (no filter)', test: () => true },
  { step: '3', action: 'Puff Count = 30000', test: (p) => p.puff === '30000' },
  { step: '4', action: '+ Nicotine Strength = 20mg', test: (p) => p.puff === '30000' && p.nic === '20mg' },
  { step: '5', action: '+ Nicotine 35mg also ticked (OR)', test: (p) => p.puff === '30000' && ['20mg', '35mg'].includes(p.nic ?? '') },
  { step: '6', action: '+ Device Type = Standard Disposable', test: (p) => p.puff === '30000' && ['20mg', '35mg'].includes(p.nic ?? '') && p.dev === 'Standard Disposable' },
  { step: '7', action: 'Puff Count 30000 unticked', test: (p) => ['20mg', '35mg'].includes(p.nic ?? '') && p.dev === 'Standard Disposable' },
  { step: '8', action: 'Puff Count = 600 ticked', test: (p) => p.puff === '600' && ['20mg', '35mg'].includes(p.nic ?? '') && p.dev === 'Standard Disposable' },
  { step: '9', action: 'Everything unticked', test: () => true },
];
void P_; void N_; void D_;

async function main() {
  const all = await fetchAll();
  const visible = all.filter((p) => p.status === 'ACTIVE' && p.online);
  const hidden = all.filter((p) => !(p.status === 'ACTIVE' && p.online));
  const tag = (p: P) => `${p.title} | ${p.vendor} | puff ${p.puff ?? '-'} | nic ${p.nic ?? '-'} | ${p.variants} flavours | stock ${p.stock}`;

  let md = `# Expected results: Disposable Vapes / Federal (straight from Shopify)\n\n`;
  md += `Source: Shopify Admin API, generated ${new Date().toISOString()}. Filter: product type "Disposable Vapes" (same search the storefront uses), tag region-federal. Only products that are **ACTIVE and published to Online Store** can appear on the storefront.\n\n`;
  md += `Products in Shopify for this bucket: **${all.length}** | visible to shoppers: **${visible.length}** | not visible (draft/unpublished): **${hidden.length}**\n\n`;
  md += `The page shows **24 products per page**; totals below are across all pages. Titles are sorted A-Z here; the on-screen order can differ, so verify by count and by checking that every card you see is in the list.\n\n`;
  md += `## Summary\n\n| Step | What you do | Total products expected | Cards on page 1 |\n|---|---|---|---|\n`;
  const per = STEPS.map((s) => ({ ...s, rows: visible.filter(s.test) }));
  for (const s of per) md += `| ${s.step} | ${s.action} | ${s.rows.length} | ${Math.min(24, s.rows.length)} |\n`;

  md += `\n## Value distribution in Shopify (visible products)\n\n| Field | Value | Products |\n|---|---|---|\n`;
  for (const [label, key] of [['Puff Count', 'puff'], ['Nicotine Strength', 'nic'], ['Device Type', 'dev']] as const) {
    const m: Record<string, number> = {};
    for (const p of visible) m[p[key] ?? '(empty)'] = (m[p[key] ?? '(empty)'] ?? 0) + 1;
    for (const [v, c] of Object.entries(m)) md += `| ${label} | ${v} | ${c} |\n`;
  }

  for (const s of per) {
    md += `\n## Step ${s.step}: ${s.action}\n\nExpected total: **${s.rows.length}**\n\n`;
    if (s.rows.length === 0) { md += `_No products should appear (empty state)._\n`; continue; }
    const shown = s.rows.slice(0, 60);
    md += `| # | Title | Brand | Puff | Nicotine | Flavours | Stock |\n|---|---|---|---|---|---|---|\n`;
    shown.forEach((p, i) => { md += `| ${i + 1} | ${p.title} | ${p.vendor} | ${p.puff ?? '-'} | ${p.nic ?? '-'} | ${p.variants} | ${p.stock} |\n`; });
    if (s.rows.length > shown.length) md += `\n_...and ${s.rows.length - shown.length} more (same pattern, "(Batch N)" clones)._\n`;
  }

  if (hidden.length) {
    md += `\n## In Shopify but NOT visible to shoppers (${hidden.length})\n\n| Title | Status | Published to Online Store |\n|---|---|---|\n`;
    for (const p of hidden) md += `| ${p.title} | ${p.status} | ${p.online ? 'yes' : 'no'} |\n`;
  }
  void tag;
  md += `\n## Notes\n\n- "(Batch N)" titles are load-test clones of one real product, so titles repeat across batches.\n- Seeded Puff Count is only "30000" or empty; Nicotine only "20mg", "0mg" or empty. So Nicotine 35mg and Puff 600 never match anything (steps 5 and 8 behave accordingly).\n`;

  const out = join(__dirname, '../../../E2E_FILTER_EXPECTED.md');
  writeFileSync(out, md);
  console.log(`wrote ${out}; total=${all.length} visible=${visible.length} hidden=${hidden.length}`);
  for (const s of per) console.log(`step ${s.step}: ${s.rows.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
