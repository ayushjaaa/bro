/**
 * Load-test seeding script — builds Disposable Vape / E-Liquid test products from the REAL
 * Shopify product-export CSVs the client provided (83 distinct real base products, ~21 flavour
 * variants each, almost all currently Federal-only), then clones each real product across the
 * other 5 regions (bc, alberta, manitoba, ontario, quebec) to reach a target tier count -- exactly
 * the same "one Shopify Product per region" architecture as `seed-testing-products.ts`, just at
 * scale. This is real client content replicated into regions the store already sells in, not
 * fabricated data.
 *
 * Distribution per tier (agreed 2026-09-19): ~80% of the tier's products land in ONE concentrated
 * bucket -- Disposable Vapes + Federal, the exact (sub-category, region) combination the scan-based
 * custom-filter path (`fetchAllMatchingProducts` in product-listing.ts) has to walk when a Filters
 * checkbox is applied -- so that bucket grows large enough to find the real breaking point. The
 * remaining ~20% spreads across E-Liquids and the other 5 regions, so the rest of the storefront
 * (mega menu, category tree, native Category/Brand/Price filtering) still looks like a normal,
 * not-single-category store.
 *
 * Every product gets tags `loadtest` + `loadtest-tier-<tier>` for later bulk cleanup (see
 * seed-load-test-cleanup.ts) and Disposable Vape products get real custom.disposable_vape_* /
 * custom.eliquid_* metafield values parsed from the product's own title (puff count, nicotine mg)
 * where derivable, matching the real choice lists seeded by update-filter-choices.ts -- otherwise
 * Shopify's metafield "choices" validation rejects the value outright.
 *
 * Idempotent/resumable: writes progress to `.loadtest-manifest.json` after every product, so a
 * re-run with a HIGHER --tier only creates the delta, and an interrupted run can be resumed by
 * re-running the same command.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/shopify/seed-load-test-products.ts --tier=200 --dry-run
 *   npx tsx --env-file=.env.local scripts/shopify/seed-load-test-products.ts --tier=200
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'node:crypto';
import { shopifyAdminRequest, assertNoUserErrors, ShopifyAdminApiError } from '../../src/lib/shopify/admin-client.core';
import { INVENTORY_LOCATION_ID } from '../../src/lib/inventory';

// Every seeded variant gets this much stock so the Availability filter has real in-stock products
// to match against -- freshly created variants activate at 0 available for this location, so
// changeFromQuantity: 0 always matches them (same pattern as _tmp-add-100-flavours-low-stock.ts).
const STOCK_PER_VARIANT = 50;

// ---------------------------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  })
);
const TIER = Number(args.tier);
if (!TIER || ![200, 500, 1000, 2000].includes(TIER)) {
  console.error('Usage: --tier=200|500|1000|2000 [--dry-run] [--csv-dir=<path>]');
  process.exit(1);
}
const DRY_RUN = args['dry-run'] === 'true';
const CSV_DIR = args['csv-dir'] || join(homedir(), 'Downloads');
const MANIFEST_PATH = join(__dirname, '.loadtest-manifest.json');

const REGIONS = ['federal', 'bc', 'alberta', 'manitoba', 'ontario', 'quebec'] as const;
type Region = (typeof REGIONS)[number];

const KNOWN_BRANDS = [
  'Flavour Beast x OXVA', 'Flavour Beast', 'Ripper Matrix', 'Flavour Drop', 'Lemon Drop Freebase',
  'Lemon Drop', 'Naked 100', 'Insta Bar', 'Berry Drop', 'GcoreHit', 'Gcore', 'Vice Salt', 'Vice',
  'Orbito', 'Fruitbae', 'Kapow', 'VFEEL', "Drip'n", 'Geek Bar Pulse', 'Geek Bar', 'Mr Fog', 'STLTH',
  'Oxbar', 'RIPPER',
];

// ---------------------------------------------------------------------------------------------
// Minimal RFC4180 CSV parser -- Shopify's export has multi-line HTML/quoted fields, so a naive
// split-by-comma/newline is not safe here.
// ---------------------------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // skip, \n handles the line break
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readCsvRecords(path: string): Record<string, string>[] {
  const text = readFileSync(path, 'utf-8').replace(/^﻿/, '');
  const rows = parseCsv(text);
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => (rec[h] = r[idx] ?? ''));
    return rec;
  });
}

// ---------------------------------------------------------------------------------------------
// Real product extraction
// ---------------------------------------------------------------------------------------------
interface RealFlavour {
  name: string;
  price: string;
}

interface RealProduct {
  handle: string;
  title: string;
  brand: string;
  category: 'Disposable Vape' | 'E-Liquid';
  flavours: RealFlavour[];
  puffCount?: string; // one of disposable_vape_puff_count choices
  nicotineMg?: string; // shared shape for both disposable_vape_nicotine_strength / eliquid_nicotine_strength
}

const PUFF_CHOICES = ['600', '2000', '5000', '7000', '10000', '15000', '20000', '25000', '30000'];
const DISPOSABLE_NICOTINE_CHOICES = ['0mg', '20mg', '35mg', '50mg'];
const ELIQUID_NICOTINE_CHOICES = ['0mg', '3mg', '6mg', '12mg', '20mg', '35mg', '50mg'];

function nearestChoice(value: number, choices: string[]): string {
  let best = choices[0];
  let bestDiff = Infinity;
  for (const c of choices) {
    const n = parseInt(c, 10);
    const diff = Math.abs(n - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

function extractBrand(title: string): string {
  for (const b of KNOWN_BRANDS) {
    if (title.startsWith(b)) return b;
  }
  return title.split(' ').slice(0, 2).join(' ');
}

function extractCategory(tags: string): 'Disposable Vape' | 'E-Liquid' {
  const t = tags.toLowerCase();
  if (t.includes('disposable')) return 'Disposable Vape';
  return 'E-Liquid';
}

function extractPuffCount(title: string): string | undefined {
  const m = title.match(/(\d+)\s*[kK]\b/);
  if (!m) return undefined;
  return nearestChoice(parseInt(m[1], 10) * 1000, PUFF_CHOICES);
}

function extractNicotineMg(title: string, category: 'Disposable Vape' | 'E-Liquid'): string | undefined {
  const m = title.match(/(\d+)\s*mg/i);
  const choices = category === 'Disposable Vape' ? DISPOSABLE_NICOTINE_CHOICES : ELIQUID_NICOTINE_CHOICES;
  if (!m) return undefined;
  return nearestChoice(parseInt(m[1], 10), choices);
}

function loadRealProducts(): RealProduct[] {
  const files = ['products_export_1.csv', 'products_export 2.csv', 'products_export (17).csv', 'products_export.csv'];
  const byHandle = new Map<string, RealProduct>();

  for (const fn of files) {
    const path = join(CSV_DIR, fn);
    if (!existsSync(path)) {
      console.log(`  (skip, not found) ${path}`);
      continue;
    }
    const records = readCsvRecords(path);
    let current: RealProduct | null = null;
    for (const r of records) {
      const handle = (r['Handle'] || '').trim();
      if (!handle) continue;
      if ((r['Title'] || '').trim()) {
        if (byHandle.has(handle)) {
          current = null; // already captured from an earlier file; still accumulate variants below via null-guard
          continue;
        }
        const title = r['Title'].trim();
        const category = extractCategory(r['Tags'] || '');
        current = {
          handle,
          title,
          brand: extractBrand(title),
          category,
          flavours: [],
          puffCount: category === 'Disposable Vape' ? extractPuffCount(title) : undefined,
          nicotineMg: extractNicotineMg(title, category),
        };
        byHandle.set(handle, current);
      }
      if (current && r['Option1 Value']) {
        const name = r['Option1 Value'].trim();
        // The real CSVs repeat the same flavour name within one product under different casing
        // (e.g. "Strawberry" and "strawberry" as separate rows) -- Shopify normalizes option
        // values case-insensitively, so productVariantsBulkCreate rejects the second one outright
        // ("The variant 'strawberry' already exists.", live-observed this session). A same-case
        // exact duplicate also occasionally slipped through untouched but left the bulk-create
        // response and inventory-item bookkeeping out of sync. Case-insensitive dedup at the
        // source avoids creating a duplicate-option-value variant at all, either way.
        if (!current.flavours.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
          current.flavours.push({ name, price: (r['Variant Price'] || '9.99').trim() });
        }
      }
    }
  }

  return Array.from(byHandle.values()).filter((p) => p.flavours.length > 0);
}

// ---------------------------------------------------------------------------------------------
// Manifest (resumable, avoids duplicate creation across tiers)
// ---------------------------------------------------------------------------------------------
interface ManifestEntry {
  handle: string;
  region: Region;
  cloneIndex: number;
  productId: string;
  bucket: 'concentrated' | 'spread';
}
interface Manifest {
  entries: ManifestEntry[];
}
function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) return { entries: [] };
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
}
function saveManifest(m: Manifest) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

// ---------------------------------------------------------------------------------------------
// Plan generation: decide which (product, region, cloneIndex) tuples are needed to reach TIER,
// on top of what the manifest says already exists. Concentrated bucket = Disposable Vape + federal.
// ---------------------------------------------------------------------------------------------
interface PlanItem {
  product: RealProduct;
  region: Region;
  cloneIndex: number;
  bucket: 'concentrated' | 'spread';
}

function buildPlan(realProducts: RealProduct[], manifest: Manifest): PlanItem[] {
  const already = new Set(manifest.entries.map((e) => `${e.handle}|${e.region}|${e.cloneIndex}`));
  const existingCount = manifest.entries.length;
  const needed = TIER - existingCount;
  if (needed <= 0) return [];

  const targetConcentrated = Math.round(TIER * 0.8);
  const existingConcentrated = manifest.entries.filter((e) => e.bucket === 'concentrated').length;
  const neededConcentrated = Math.max(0, targetConcentrated - existingConcentrated);
  const neededSpread = needed - neededConcentrated;

  const disposables = realProducts.filter((p) => p.category === 'Disposable Vape');
  const eliquids = realProducts.filter((p) => p.category === 'E-Liquid');

  const plan: PlanItem[] = [];

  // Concentrated: Disposable Vape + federal only, cycling through real products, then bumping
  // cloneIndex (title suffix) once every real product has been used once for this bucket.
  let cloneIndex = 0;
  while (plan.filter((p) => p.bucket === 'concentrated').length < neededConcentrated) {
    let addedThisPass = false;
    for (const product of disposables) {
      if (plan.filter((p) => p.bucket === 'concentrated').length >= neededConcentrated) break;
      const key = `${product.handle}|federal|${cloneIndex}`;
      if (!already.has(key)) {
        plan.push({ product, region: 'federal', cloneIndex, bucket: 'concentrated' });
        already.add(key);
        addedThisPass = true;
      }
    }
    cloneIndex++;
    if (!addedThisPass && cloneIndex > 200) break; // safety valve, avoid infinite loop if disposables is empty
  }

  // Spread: E-Liquids (and any leftover Disposable Vape capacity) across the 5 non-federal regions.
  const spreadRegions: Region[] = ['bc', 'alberta', 'manitoba', 'ontario', 'quebec'];
  let spreadClone = 0;
  const spreadPool = eliquids.length > 0 ? eliquids : disposables;
  while (plan.filter((p) => p.bucket === 'spread').length < neededSpread) {
    let addedThisPass = false;
    for (const region of spreadRegions) {
      for (const product of spreadPool) {
        if (plan.filter((p) => p.bucket === 'spread').length >= neededSpread) break;
        const key = `${product.handle}|${region}|${spreadClone}`;
        if (!already.has(key)) {
          plan.push({ product, region, cloneIndex: spreadClone, bucket: 'spread' });
          already.add(key);
          addedThisPass = true;
        }
      }
    }
    spreadClone++;
    if (!addedThisPass && spreadClone > 200) break;
  }

  return plan;
}

// ---------------------------------------------------------------------------------------------
// Shopify mutations
// ---------------------------------------------------------------------------------------------
const PRODUCT_CREATE_MUTATION = /* GraphQL */ `
  mutation ProductCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product { id title variants(first: 1) { nodes { id inventoryItem { id } } } }
      userErrors { field message }
    }
  }
`;
const BULK_VARIANT_CREATE_MUTATION = /* GraphQL */ `
  mutation BulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: REMOVE_STANDALONE_VARIANT) {
      productVariants { id inventoryItem { id } }
      userErrors { field message }
    }
  }
`;
const INVENTORY_SET_QUANTITIES_MUTATION = /* GraphQL */ `
  mutation SetQuantities($input: InventorySetQuantitiesInput!, $key: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $key) {
      userErrors { field message }
    }
  }
`;
const GET_ONLINE_STORE_PUBLICATION_QUERY = /* GraphQL */ `
  query { publications(first: 10) { nodes { id name } } }
`;
const PUBLISHABLE_PUBLISH_MUTATION = /* GraphQL */ `
  mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) { userErrors { field message } }
  }
`;

const MAX_RETRY_ATTEMPTS = 8;

async function withRetry<T>(fn: () => Promise<T>, label: string, attempt = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // Broadened (2026-09-19, live-observed this session): started out only retrying
    // ShopifyAdminApiError "throttled"/"could not be found", but a sustained high-volume batch
    // (500+ products in a tight loop) also throws raw Node fetch-level errors ("fetch failed" --
    // a TypeError, not a ShopifyAdminApiError, e.g. a dropped connection under sustained load) that
    // the narrower check let through uncaught and killed the whole run. In this bulk-seeding
    // context virtually every failure this deep into a loop is transient (rate limiting, briefly
    // dropped connection, eventual-consistency lag) rather than a real data problem, so now
    // anything gets retried with backoff -- a genuinely bad request would still fail after 8
    // attempts and surface loudly rather than retrying forever.
    const errText = err instanceof ShopifyAdminApiError ? JSON.stringify(err.errors) : err instanceof Error ? err.message : String(err);
    if (attempt <= MAX_RETRY_ATTEMPTS) {
      const backoffMs = 1000 * attempt;
      console.log(`    transient error on ${label} (${errText.slice(0, 200)}), retrying in ${backoffMs}ms (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`);
      await new Promise((r) => setTimeout(r, backoffMs));
      return withRetry(fn, label, attempt + 1);
    }
    throw err;
  }
}

function productTypeFor(item: PlanItem): string {
  return item.product.category === 'Disposable Vape' ? 'Standard Disposable Vapes' : 'Freebase E-Liquid';
}

function metafieldsFor(item: PlanItem): Array<{ namespace: string; key: string; type: string; value: string }> {
  const fields: Array<{ namespace: string; key: string; type: string; value: string }> = [];
  if (item.product.category === 'Disposable Vape') {
    if (item.product.puffCount) fields.push({ namespace: 'custom', key: 'disposable_vape_puff_count', type: 'single_line_text_field', value: item.product.puffCount });
    if (item.product.nicotineMg) fields.push({ namespace: 'custom', key: 'disposable_vape_nicotine_strength', type: 'single_line_text_field', value: item.product.nicotineMg });
    fields.push({ namespace: 'custom', key: 'disposable_vape_device_type', type: 'single_line_text_field', value: 'Standard Disposable' });
  } else {
    if (item.product.nicotineMg) fields.push({ namespace: 'custom', key: 'eliquid_nicotine_strength', type: 'single_line_text_field', value: item.product.nicotineMg });
    fields.push({ namespace: 'custom', key: 'eliquid_bottle_size', type: 'single_line_text_field', value: '30ml' });
  }
  return fields;
}

async function createOne(item: PlanItem, publicationId: string): Promise<string> {
  const regionLabel = item.region.charAt(0).toUpperCase() + item.region.slice(1);
  // Clone number is a title prefix ("1Geek Bar ...", "2Geek Bar ...") so repeated real products
  // never share an identical name (matches rename-loadtest-titles.ts on already-created ones).
  const title = `${item.cloneIndex + 1}${item.product.title.replace(/ - Federal$/i, '')} - ${regionLabel}`;

  const data = await withRetry(
    () =>
      shopifyAdminRequest<any>(PRODUCT_CREATE_MUTATION, {
        product: {
          title,
          productType: productTypeFor(item),
          vendor: item.product.brand,
          tags: [`region-${item.region}`, 'loadtest', `loadtest-tier-${TIER}`],
          productOptions: [{ name: 'Flavor', values: [{ name: item.product.flavours[0]?.name || 'Default' }] }],
          metafields: metafieldsFor(item),
        },
      }),
    `productCreate(${title})`
  );
  assertNoUserErrors(data.productCreate.userErrors, `productCreate(${title})`);
  const productId = data.productCreate.product.id as string;
  const inventoryItemIds: string[] = data.productCreate.product.variants.nodes
    .map((v: any) => v.inventoryItem?.id)
    .filter(Boolean);

  const variants = item.product.flavours.slice(1).map((f) => ({
    optionValues: [{ name: f.name, optionName: 'Flavor' }],
    price: f.price,
  }));
  if (variants.length > 0) {
    // Shopify caps productVariantsBulkCreate at 100 per call.
    for (let i = 0; i < variants.length; i += 90) {
      const chunk = variants.slice(i, i + 90);
      const vdata = await withRetry(
        () => shopifyAdminRequest<any>(BULK_VARIANT_CREATE_MUTATION, { productId, variants: chunk }),
        `productVariantsBulkCreate(${title})`
      );
      const userErrors = vdata.productVariantsBulkCreate.userErrors ?? [];
      // "already exists" (2026-09-19, live-observed): the real CSVs still have a few flavour-name
      // collisions the case-insensitive dedup above doesn't catch (e.g. an invisible/whitespace
      // difference), which Shopify rejects per-variant rather than failing the whole call --
      // productVariants below already only contains the ones that DID succeed, so a product simply
      // ends up with slightly fewer flavours than the source data, which doesn't affect what this
      // load test measures (filter-scan latency at scale). Any OTHER userError is still fatal.
      const unexpected = userErrors.filter((e: any) => !/already exists/i.test(e.message));
      if (unexpected.length > 0) assertNoUserErrors(unexpected, `productVariantsBulkCreate(${title})`);
      else if (userErrors.length > 0) console.log(`    (skipped ${userErrors.length} duplicate flavour name(s) for ${title})`);
      for (const v of vdata.productVariantsBulkCreate.productVariants) {
        if (v.inventoryItem?.id) inventoryItemIds.push(v.inventoryItem.id);
      }
    }
  }

  if (inventoryItemIds.length > 0) {
    try {
      const idata = await withRetry(
        () =>
          shopifyAdminRequest<any>(INVENTORY_SET_QUANTITIES_MUTATION, {
            key: randomUUID(),
            input: {
              name: 'available',
              reason: 'correction',
              quantities: inventoryItemIds.map((id) => ({
                inventoryItemId: id,
                locationId: INVENTORY_LOCATION_ID,
                quantity: STOCK_PER_VARIANT,
                changeFromQuantity: 0,
              })),
            },
          }),
        `inventorySetQuantities(${title})`
      );
      assertNoUserErrors(idata.inventorySetQuantities.userErrors, `inventorySetQuantities(${title})`);
    } catch (err) {
      // Rare Shopify-side edge case (see flavour-dedup comment above) -- an occasional
      // inventoryItemId from the create response doesn't resolve. Don't let one bad ID block the
      // whole product (and this whole 500/1000/2000-product batch); log it and move on -- the
      // product is still created and published, just possibly short a unit of stock on one variant,
      // which doesn't affect what this session is actually measuring (filter-scan latency at scale).
      console.log(`    WARNING: inventorySetQuantities failed for ${title}, continuing without full stock -- ${err instanceof Error ? err.message : err}`);
    }
  }

  await withRetry(
    () => shopifyAdminRequest<any>(PUBLISHABLE_PUBLISH_MUTATION, { id: productId, input: [{ publicationId }] }),
    `publish(${title})`
  );

  return productId;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
async function main() {
  console.log(`Loading real product data from ${CSV_DIR} ...`);
  const realProducts = loadRealProducts();
  console.log(`  ${realProducts.length} real base products loaded (${realProducts.filter((p) => p.category === 'Disposable Vape').length} Disposable Vape, ${realProducts.filter((p) => p.category === 'E-Liquid').length} E-Liquid)`);

  const manifest = loadManifest();
  console.log(`  ${manifest.entries.length} products already seeded (from previous tiers/runs)`);

  const plan = buildPlan(realProducts, manifest);
  console.log(`\nTier ${TIER}: ${plan.length} new products to create (${plan.filter((p) => p.bucket === 'concentrated').length} concentrated in Disposable Vapes/Federal, ${plan.filter((p) => p.bucket === 'spread').length} spread across E-Liquids/other regions)`);

  if (plan.length === 0) {
    console.log('Nothing to do -- manifest already covers this tier.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: showing first 15 and last 5 planned products, no Shopify calls made.\n');
    for (const item of plan.slice(0, 15)) {
      console.log(`  [${item.bucket}] ${item.product.title} -> region=${item.region} clone=${item.cloneIndex} brand=${item.product.brand} flavours=${item.product.flavours.length} puff=${item.product.puffCount ?? '-'} nic=${item.product.nicotineMg ?? '-'}`);
    }
    console.log('  ...');
    for (const item of plan.slice(-5)) {
      console.log(`  [${item.bucket}] ${item.product.title} -> region=${item.region} clone=${item.cloneIndex}`);
    }
    return;
  }

  const pubData = await shopifyAdminRequest<any>(GET_ONLINE_STORE_PUBLICATION_QUERY);
  const publicationId = pubData.publications.nodes.find((p: any) => p.name === 'Online Store')?.id;
  if (!publicationId) throw new Error('"Online Store" publication not found');

  let created = 0;
  for (const item of plan) {
    try {
      const productId = await createOne(item, publicationId);
      manifest.entries.push({ handle: item.product.handle, region: item.region, cloneIndex: item.cloneIndex, productId, bucket: item.bucket });
      saveManifest(manifest); // after every product -- resumable if interrupted
      created++;
      if (created % 10 === 0) console.log(`  ${created}/${plan.length} created...`);
      // Bumped from 300ms (2026-09-19, live-observed): tier-1000's higher sustained volume drove
      // near-100% inventorySetQuantities throttling and eventually a dropped connection -- this
      // store's real per-app cost bucket refills slower than 300ms/product sustained over hundreds
      // of products (each product = productCreate + N/90 variant-bulk calls + 1 inventory call).
      await new Promise((r) => setTimeout(r, 700));
    } catch (err) {
      console.error(`  FAILED on ${item.product.title} (${item.region}, clone ${item.cloneIndex}):`, err instanceof Error ? err.message : err);
      if (err instanceof ShopifyAdminApiError) console.error('  Details:', JSON.stringify(err.errors, null, 2));
      throw err;
    }
  }

  console.log(`\nDone. Created ${created} new products. Total in manifest: ${manifest.entries.length}.`);
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  if (err instanceof ShopifyAdminApiError) console.error('Details:', JSON.stringify(err.errors, null, 2));
  process.exit(1);
});
