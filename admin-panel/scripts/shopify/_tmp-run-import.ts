/**
 * Imports the 299 new Jubilee products (cones, torch lighters, 33 new vapes) from
 * import_plan.json (built by build_import_plan.py from the 3 CSVs, with the 69 already-live
 * vape duplicates already excluded).
 *
 * Mirrors createProductLine + bulkCreateVariants (src/data/products.ts, src/data/variants.ts)
 * exactly -- same mutations, same REMOVE_STANDALONE_VARIANT strategy, same metafield shape --
 * run directly via shopifyAdminRequest since this is a one-off script, not a request inside the
 * Next.js app (no admin session to satisfy requireAdmin()).
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-run-import.ts [--limit N] [--only handle]
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync, writeFileSync } from 'fs';

const INVENTORY_LOCATION_ID = 'gid://shopify/Location/84994621638';

// Shopify enforces these as validated-choice metafield definitions -- a value outside the list is
// REJECTED (fails the whole productCreate), not silently accepted. Drop filter values that aren't
// in the current choices list instead of failing the product; report what was dropped so the
// choices lists can be extended later (same gap TAXONOMY_MAPPING_COMPARISON.md §9 already flagged).
const FILTER_CHOICES: Record<string, string[]> = {
  cone_cone_size: ['1¼', 'King Size', '98mm', '109mm'],
  torch_lighter_pack_display_quantity: ['Single', '5-Count Display', '20-Count Display'],
  disposable_vape_puff_count: ['600', '2000', '5000', '7000', '10000', '15000', '20000', '25000', '30000', '40000', '60000', '80000', '100000', '120000'],
  disposable_vape_nicotine_strength: ['0mg', '20mg', '35mg', '50mg'],
  disposable_vape_pack_quantity: ['Single', '5-Pack', '10-Pack', 'Display Box'],
  pod_nicotine_strength: ['20mg', '35mg', '50mg'],
  pod_pack_quantity: ['2-Pack', '4-Pack'],
  eliquid_bottle_size: ['30ml', '60ml', '100ml', '120ml'],
  eliquid_nicotine_strength: ['0mg', '3mg', '6mg', '12mg', '20mg', '35mg', '50mg'],
  eliquid_pack_quantity: ['Single', '3-Pack'],
  rolling_paper_paper_size: ['King Size', 'King Size Slim', '1¼', 'Single Wide', '1/2'],
};

function filterAllowedFilterValues(
  filterValues: Record<string, string>
): { kept: Record<string, string>; dropped: string[] } {
  const kept: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(filterValues)) {
    const choices = FILTER_CHOICES[key];
    if (choices && !choices.includes(value)) {
      dropped.push(`${key}="${value}"`);
      continue;
    }
    kept[key] = value;
  }
  return { kept, dropped };
}

const SUBCATEGORY_IDS: Record<string, string> = {
  'Pre-Rolled Cones': 'gid://shopify/Metaobject/252081307846',
  'Torch Lighters': 'gid://shopify/Metaobject/252081438918',
  'Disposable Vapes': 'gid://shopify/Metaobject/252079571142',
  'E-Liquids / Vape Juice': 'gid://shopify/Metaobject/252080062662',
  'Pre-Filled Pods': 'gid://shopify/Metaobject/252080521414',
  'Rolling Papers': 'gid://shopify/Metaobject/252081045702',
  'Filters & Tips': 'gid://shopify/Metaobject/252081340614',
};

type PlanVariant = { name: string; price: string; sku: string };
type PlanProduct = {
  handle: string;
  title: string;
  subcategory: string;
  brand: string;
  region: string | null;
  filterValues: Record<string, string>;
  optionName: string;
  variants: PlanVariant[];
};

const PRODUCT_CREATE_MUTATION = /* GraphQL */ `
  mutation ProductCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product { id title }
      userErrors { field message }
    }
  }
`;

const BULK_VARIANTS_CREATE_MUTATION = /* GraphQL */ `
  mutation BulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: REMOVE_STANDALONE_VARIANT) {
      productVariants { id }
      userErrors { field message }
    }
  }
`;

const LIST_BRANDS_QUERY = /* GraphQL */ `
  query { metaobjects(type: "brand", first: 250) { nodes { id fields { key value } } } }
`;

async function loadBrandMap(): Promise<Map<string, string>> {
  const data = await shopifyAdminRequest<any>(LIST_BRANDS_QUERY);
  const map = new Map<string, string>();
  for (const n of data.metaobjects.nodes) {
    const f: any = {};
    n.fields.forEach((x: any) => (f[x.key] = x.value));
    map.set(`${f.sub_category}::${f.name}`, n.id);
  }
  return map;
}

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

function buildVariantInput(v: PlanVariant) {
  const price = MONEY_RE.test(v.price) ? v.price : '0.01';
  const input: Record<string, unknown> = {
    optionValues: [{ name: v.name.slice(0, 255) || 'Default', optionName: 'Flavor' }],
    price,
    inventoryQuantities: [{ availableQuantity: 0, locationId: INVENTORY_LOCATION_ID }],
  };
  if (v.sku) input.inventoryItem = { sku: v.sku };
  return input;
}

async function importProduct(p: PlanProduct, brandMap: Map<string, string>): Promise<{ ok: boolean; id?: string; error?: string; dropped?: string[] }> {
  const subcategoryId = SUBCATEGORY_IDS[p.subcategory];
  if (!subcategoryId) return { ok: false, error: `unknown subcategory "${p.subcategory}"` };
  const brandId = brandMap.get(`${subcategoryId}::${p.brand}`);
  if (!brandId) return { ok: false, error: `brand not found: "${p.brand}" under "${p.subcategory}"` };
  if (p.variants.length === 0) return { ok: false, error: 'no variants with a price' };

  const metafields: Array<{ namespace: string; key: string; type: string; value: string }> = [
    { namespace: 'taxonomy', key: 'brand', type: 'metaobject_reference', value: brandId },
  ];
  // Region is a province-specific excise-stamp concept (vapes/nicotine products only) -- a
  // product with no region tag/metafield is "available everywhere" (see region-rules.ts), which is
  // the correct state for region-agnostic products like rolling papers/cones/lighters. Only write
  // the tag/metafield when the plan actually specifies a region.
  if (p.region) {
    metafields.push({ namespace: 'custom', key: 'region', type: 'single_line_text_field', value: p.region });
  }
  const { kept, dropped } = filterAllowedFilterValues(p.filterValues);
  for (const [key, value] of Object.entries(kept)) {
    if (!value) continue;
    metafields.push({ namespace: 'custom', key, type: 'single_line_text_field', value });
  }

  const createData = await shopifyAdminRequest<any>(PRODUCT_CREATE_MUTATION, {
    product: {
      title: p.title,
      productType: p.subcategory,
      vendor: p.brand,
      tags: p.region ? [`region-${p.region}`] : [],
      productOptions: [{ name: 'Flavor', values: [{ name: 'Default' }] }],
      metafields,
    },
  });
  const createErrs = createData.productCreate.userErrors;
  if (createErrs?.length) return { ok: false, error: `productCreate: ${JSON.stringify(createErrs)}` };
  const productId = createData.productCreate.product?.id;
  if (!productId) return { ok: false, error: 'productCreate returned no product' };

  // Variants in batches of 100 (proven-safe batch size, same as bulkCreateVariants)
  for (let i = 0; i < p.variants.length; i += 100) {
    const batch = p.variants.slice(i, i + 100).map(buildVariantInput);
    const varData = await shopifyAdminRequest<any>(BULK_VARIANTS_CREATE_MUTATION, {
      productId,
      variants: batch,
    });
    const varErrs = varData.productVariantsBulkCreate.userErrors;
    if (varErrs?.length) {
      return { ok: false, id: productId, error: `productVariantsBulkCreate: ${JSON.stringify(varErrs)}` };
    }
  }

  return { ok: true, id: productId, dropped: dropped.length ? dropped : undefined };
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  const planFile = process.env.IMPORT_PLAN_FILE || '/Users/ayushjaiswal/Downloads/import_plan.json';
  const plan: PlanProduct[] = JSON.parse(readFileSync(planFile, 'utf-8'));
  const targets = (only ? plan.filter((p) => p.handle === only) : plan).slice(0, limit);

  console.log(`Loading brand map...`);
  const brandMap = await loadBrandMap();
  console.log(`Importing ${targets.length} products...\n`);

  const results: Array<{ handle: string; ok: boolean; id?: string; error?: string }> = [];
  let ok = 0, fail = 0;
  for (const p of targets) {
    const r = await importProduct(p, brandMap);
    results.push({ handle: p.handle, ...r });
    if (r.ok) {
      ok++;
      const droppedNote = r.dropped ? ` [dropped filters: ${r.dropped.join(', ')}]` : '';
      console.log(`OK   ${p.handle} (${p.variants.length} variants) -> ${r.id}${droppedNote}`);
    } else {
      fail++;
      console.log(`FAIL ${p.handle}: ${r.error}`);
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`);
  writeFileSync(
    '/Users/ayushjaiswal/Downloads/import_results.json',
    JSON.stringify(results, null, 2)
  );
  console.log('Wrote import_results.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
