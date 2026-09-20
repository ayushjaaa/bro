/**
 * Backfill script — sets real stock on every variant of every product tagged `loadtest` (the
 * load-test seed batches from seed-load-test-products.ts). Needed because tier 200 (and the start
 * of tier 500) were created before that script set inventory itself — those variants activated at
 * 0 available, which silently broke the Availability filter's "in stock" test (only 1/160
 * concentrated products matched instead of ~all of them). seed-load-test-products.ts now sets
 * stock at creation time going forward; this is a one-time catch-up for what it already created.
 *
 * Reads each variant's CURRENT available quantity first (rather than assuming 0) so
 * `changeFromQuantity` is always correct -- inventorySetQuantities is a compare-and-set and
 * silently no-ops per-item if the stated `changeFromQuantity` doesn't match reality. Safe to
 * re-run: already-stocked variants (`current === STOCK_PER_VARIANT`) are skipped.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/backfill-loadtest-inventory.ts
 */
import { randomUUID } from 'node:crypto';
import { shopifyAdminRequest, assertNoUserErrors, ShopifyAdminApiError } from '../../src/lib/shopify/admin-client.core';
import { INVENTORY_LOCATION_ID } from '../../src/lib/inventory';

async function withRetry<T>(fn: () => Promise<T>, label: string, attempt = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const isThrottled =
      err instanceof ShopifyAdminApiError && JSON.stringify(err.errors).toLowerCase().includes('throttled');
    if (isThrottled && attempt <= 12) {
      const backoffMs = 2000 * attempt;
      console.log(`    throttled on ${label}, retrying in ${backoffMs}ms (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, backoffMs));
      return withRetry(fn, label, attempt + 1);
    }
    throw err;
  }
}

const STOCK_PER_VARIANT = 50;

const LIST_QUERY = /* GraphQL */ `
  query ListLoadtestProducts($after: String) {
    products(query: "tag:loadtest", first: 20, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        variants(first: 100) {
          nodes {
            id
            inventoryItem {
              id
              inventoryLevel(locationId: "${INVENTORY_LOCATION_ID}") {
                quantities(names: ["available"]) { quantity }
              }
            }
          }
        }
      }
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

interface Quantity {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  changeFromQuantity: number;
}

async function setBatch(quantities: Quantity[]) {
  if (quantities.length === 0) return;
  const data = await withRetry(
    () =>
      shopifyAdminRequest<any>(INVENTORY_SET_QUANTITIES_MUTATION, {
        key: randomUUID(),
        input: { name: 'available', reason: 'correction', quantities },
      }),
    'inventorySetQuantities(backfill batch)'
  );
  assertNoUserErrors(data.inventorySetQuantities.userErrors, 'inventorySetQuantities(backfill batch)');
}

async function main() {
  let after: string | undefined;
  let hasNextPage = true;
  let totalProducts = 0;
  let totalVariants = 0;
  let alreadyStocked = 0;
  let pendingBatch: Quantity[] = [];

  while (hasNextPage) {
    const data = await withRetry(() => shopifyAdminRequest<any>(LIST_QUERY, { after }), 'products list page');
    for (const product of data.products.nodes) {
      totalProducts++;
      for (const v of product.variants.nodes) {
        const itemId = v.inventoryItem?.id;
        if (!itemId) continue;
        const current = v.inventoryItem.inventoryLevel?.quantities?.[0]?.quantity ?? 0;
        totalVariants++;
        if (current === STOCK_PER_VARIANT) {
          alreadyStocked++;
          continue;
        }
        pendingBatch.push({
          inventoryItemId: itemId,
          locationId: INVENTORY_LOCATION_ID,
          quantity: STOCK_PER_VARIANT,
          changeFromQuantity: current,
        });
        if (pendingBatch.length >= 200) {
          await setBatch(pendingBatch);
          console.log(`  stocked batch of ${pendingBatch.length} (running total variants seen: ${totalVariants})`);
          pendingBatch = [];
        }
      }
    }
    hasNextPage = data.products.pageInfo.hasNextPage;
    after = data.products.pageInfo.endCursor ?? undefined;
    console.log(`  ...${totalProducts} products scanned so far`);
  }

  await setBatch(pendingBatch);

  console.log(`\nDone. ${totalProducts} loadtest products, ${totalVariants} variants scanned, ${alreadyStocked} already at ${STOCK_PER_VARIANT}, ${totalVariants - alreadyStocked} updated.`);
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  if (err instanceof ShopifyAdminApiError) console.error('Details:', JSON.stringify(err.errors, null, 2));
  process.exit(1);
});
