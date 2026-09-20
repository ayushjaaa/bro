/**
 * Writes E2E_FILTER_MANUAL_CHECK.md (repo root): for every filter value and a set of combinations,
 * the exact number of products Shopify says should show on Disposable Vapes / Federal (ACTIVE and
 * published to Online Store), with a few example product titles. Pure Shopify Admin data, not the
 * storefront's own code.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/generate-manual-check-table.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const Q = /* GraphQL */ `
  query($after: String) {
    products(query: "product_type:\\"Disposable Vapes\\" AND tag:\\"region-federal\\"", first: 50, after: $after, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        title vendor status
        resourcePublications(first: 5) { nodes { publication { name } } }
        puff: metafield(namespace: "custom", key: "disposable_vape_puff_count") { value }
        nic: metafield(namespace: "custom", key: "disposable_vape_nicotine_strength") { value }
        type: metafield(namespace: "custom", key: "disposable_vape_nicotine_type") { value }
        dev: metafield(namespace: "custom", key: "disposable_vape_device_type") { value }
        pack: metafield(namespace: "custom", key: "disposable_vape_pack_quantity") { value }
      }
    }
  }
`;

type F = 'puff' | 'nic' | 'type' | 'dev' | 'pack';
interface P { title: string; vendor: string; puff?: string; nic?: string; type?: string; dev?: string; pack?: string }
const LABEL: Record<F, string> = { puff: 'Puff Count', nic: 'Nicotine Strength', type: 'Nicotine Type', dev: 'Device Type', pack: 'Pack Quantity' };
const ORDER: Record<F, string[]> = {
  puff: ['600', '2000', '5000', '7000', '10000', '15000', '20000', '25000', '30000', '40000', '60000', '80000', '100000', '120000'],
  nic: ['0mg', '20mg', '35mg', '50mg'],
  type: ['Freebase', 'Nicotine Salt', 'Nicotine-Free'],
  dev: ['Standard Disposable', 'Rechargeable Disposable', 'Mesh Coil'],
  pack: ['Single', '5-Pack', '10-Pack', 'Display Box'],
};

async function fetchAll(): Promise<P[]> {
  const out: P[] = [];
  let after: string | undefined;
  for (;;) {
    let d: any;
    for (let a = 1; a <= 12; a++) { try { d = await shopifyAdminRequest<any>(Q, { after }); break; } catch (e) { if (a === 12) throw e; await new Promise((r) => setTimeout(r, 2000 * a)); } }
    for (const n of d.products.nodes) {
      if (n.status !== 'ACTIVE' || !n.resourcePublications.nodes.some((x: any) => x.publication.name === 'Online Store')) continue;
      out.push({ title: n.title, vendor: n.vendor, puff: n.puff?.value, nic: n.nic?.value, type: n.type?.value, dev: n.dev?.value, pack: n.pack?.value });
    }
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }
  return out;
}

type Sel = Partial<Record<F, string[]>>;
const match = (p: P, s: Sel) => (Object.entries(s) as Array<[F, string[]]>).every(([f, vals]) => vals.length === 0 || (p[f] !== undefined && vals.includes(p[f]!)));
const describe = (s: Sel) => (Object.entries(s) as Array<[F, string[]]>).map(([f, v]) => `${LABEL[f]} = ${v.join(' or ')}`).join(' AND ');
const url = (s: Sel) => '&' + (Object.entries(s) as Array<[F, string[]]>).flatMap(([f, v]) => v.map((x) => `disposable_vape_${{ puff: 'puff_count', nic: 'nicotine_strength', type: 'nicotine_type', dev: 'device_type', pack: 'pack_quantity' }[f]}=${encodeURIComponent(x)}`)).join('&');
const pages = (n: number) => Math.max(1, Math.ceil(n / 24));

async function main() {
  const all = await fetchAll();
  const sample = (s: Sel) => all.filter((p) => match(p, s)).slice(0, 3).map((p) => p.title).join('; ');
  let md = `# Manual filter check: Disposable Vapes / Federal\n\nGenerated ${new Date().toISOString()} from Shopify Admin data (products that are ACTIVE and published to Online Store). Total products in this bucket with no filter: **${all.length}**.\n\n`;
  md += `## How to check\n\n1. Run the storefront (\`npm run dev\` in storefront/), open \`http://localhost:3000/products?category=vape&subcategory=disposable-vapes\`, and make sure the header region is **Federal**.\n2. Tick the checkbox(es) in the sidebar Filters (or open the direct link in the last column).\n3. The page shows **24 products per page**. Count total by clicking Next until the end (pages = ceil(total / 24)).\n4. Compare with "Expected total". "Example titles" are the first few in A-Z order, the on-screen order can differ; the point is every card must be a product that really has that value.\n\n`;

  md += `## A. One filter value at a time\n\n| Filter | Value | Expected total | Pages | Example titles |\n|---|---|---|---|---|\n`;
  for (const f of Object.keys(ORDER) as F[]) {
    for (const v of ORDER[f]) {
      const s: Sel = { [f]: [v] };
      const n = all.filter((p) => match(p, s)).length;
      md += `| ${LABEL[f]} | ${v} | ${n} | ${pages(n)} | ${sample(s).replace(/\|/g, '/')} |\n`;
    }
    const none = all.filter((p) => p[f] === undefined).length;
    md += `| ${LABEL[f]} | _(product has no value)_ | ${none} | ${pages(none)} | never appears under any ${LABEL[f]} checkbox |\n`;
  }

  const combos: Sel[] = [
    { nic: ['35mg'], type: ['Nicotine Salt'] },
    { puff: ['60000'], dev: ['Rechargeable Disposable'] },
    { nic: ['20mg', '35mg'] },
    { puff: ['40000'], nic: ['50mg'], pack: ['5-Pack'] },
    { puff: ['100000'], nic: ['0mg'], type: ['Freebase'], dev: ['Mesh Coil'], pack: ['Display Box'] },
    { puff: ['600', '2000'], type: ['Nicotine-Free'] },
    { puff: ['40000', '60000', '80000'], nic: ['20mg', '35mg'], dev: ['Standard Disposable'] },
  ];
  // Add a few combinations that must come back EMPTY (found by search so the expectation is exact).
  const zero: Sel[] = [];
  const F_ = Object.keys(ORDER) as F[];
  outer: for (const a of ORDER.puff) for (const b of ORDER.nic) for (const c of ORDER.pack) for (const d of ORDER.dev) {
    const s: Sel = { puff: [a], nic: [b], pack: [c], dev: [d] };
    if (!all.some((p) => match(p, s))) { zero.push(s); if (zero.length >= 3) break outer; }
  }
  void F_;
  md += `\n## B. Combinations (all ticked together)\n\n| # | Filters | Expected total | Pages | Direct link suffix |\n|---|---|---|---|---|\n`;
  [...combos, ...zero].forEach((s, i) => {
    const n = all.filter((p) => match(p, s)).length;
    md += `| ${i + 1} | ${describe(s)} | **${n}**${n === 0 ? ' (empty state)' : ''} | ${n === 0 ? 0 : pages(n)} | \`${url(s)}\` |\n`;
  });
  md += `\nRule: values inside ONE filter are OR (any of them), different filters are AND (all must match).\n`;
  md += `\n## Notes\n\n- Titles with a leading number (1, 2, 3...) are clones of the same real product.\n- 2 older products (Elf Bar) have no Nicotine Type / Device Type / Pack Quantity, so they only show under Puff/Nicotine filters they actually have.\n- Some products deliberately have an empty Nicotine, Puff or Pack value, to check they never appear under a checkbox.\n`;

  const out = join(__dirname, '../../../E2E_FILTER_MANUAL_CHECK.md');
  writeFileSync(out, md);
  console.log('wrote', out, 'bucket size', all.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
