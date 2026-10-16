/**
 * Read-only. Fetches every product handle currently in the live Shopify store,
 * then compares against the handles in the three new Jubilee import CSVs
 * (cones, torch lighters, vapes/e-liquids) to flag which would be duplicates
 * vs. genuinely new before any import runs.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-check-new-import-duplicates.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const LIST_QUERY = /* GraphQL */ `
  query List($after: String) {
    products(first: 250, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { handle title }
    }
  }
`;

async function fetchAllLiveHandles(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let after: string | null = null;
  for (;;) {
    const data: any = await shopifyAdminRequest(LIST_QUERY, { after });
    for (const n of data.products.nodes) map.set(n.handle, n.title);
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return map;
}

function loadCsvHandles(path: string): Map<string, string> {
  const raw = readFileSync(path, 'utf-8');
  const rows: any[] = parse(raw, { columns: true, skip_empty_lines: true });
  const map = new Map<string, string>();
  for (const row of rows) {
    const handle = (row['Handle'] || '').trim();
    if (!handle) continue;
    if (!map.has(handle) && (row['Title'] || '').trim()) map.set(handle, row['Title'].trim());
  }
  return map;
}

async function main() {
  console.log('Fetching live Shopify product handles...');
  const live = await fetchAllLiveHandles();
  console.log(`Live store: ${live.size} products\n`);

  const files: Record<string, string> = {
    'Pre-Rolled Cones': '/Users/ayushjaiswal/Downloads/products_import_pre_rolled_cones_final.csv',
    'Torch Lighters': '/Users/ayushjaiswal/Downloads/products_import_torch_lighters_final.csv',
    'Vapes / E-Liquids': '/Users/ayushjaiswal/Downloads/products_import_vapes_eliquids_final.csv',
  };

  let totalNew = 0;
  let totalDup = 0;

  for (const [label, path] of Object.entries(files)) {
    const csvHandles = loadCsvHandles(path);
    const dups: string[] = [];
    const news: string[] = [];
    for (const [handle, title] of csvHandles) {
      if (live.has(handle)) dups.push(`${handle}  ("${title}")`);
      else news.push(handle);
    }
    totalNew += news.length;
    totalDup += dups.length;
    console.log(`=== ${label}: ${csvHandles.size} in CSV | ${news.length} new | ${dups.length} already in store ===`);
    if (dups.length) {
      console.log('  Already-in-store handles (would duplicate if re-imported):');
      dups.forEach((d) => console.log(`   - ${d}`));
    }
    console.log('');
  }

  console.log(`TOTAL: ${totalNew} genuinely new, ${totalDup} already exist in the live store.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
