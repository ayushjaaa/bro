/**
 * One-off load-test script: adds Flavour 2..Flavour 100 to "Price Test — Low Stock — Federal"
 * (currently just Flavour 1), matching its existing price plan (wholesale $10.00 / retail $9.00),
 * each seeded to 50 units of stock. Purpose: stress-test the storefront/admin-panel stock/pricing
 * pipeline against a product with 100 variants, not a real catalog product.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-add-100-flavours-low-stock.ts
 */
import { randomUUID } from 'node:crypto';
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';
import { INVENTORY_LOCATION_ID } from '../../src/lib/inventory';

const PRODUCT_ID = 'gid://shopify/Product/9071960621254';
const WHOLESALE_PRICE = '10.00';
const RETAIL_PRICE = '9.00';
const CURRENCY = 'CAD';
const STOCK_PER_VARIANT = 50;

const BULK_VARIANT_CREATE_MUTATION = /* GraphQL */ `
  mutation BulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: DEFAULT) {
      productVariants { id title inventoryItem { id } }
      userErrors { field message }
    }
  }
`;

const INVENTORY_SET_QUANTITIES_MUTATION = /* GraphQL */ `
  mutation SetQuantities($input: InventorySetQuantitiesInput!, $key: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $key) {
      inventoryAdjustmentGroup { changes { name delta } }
      userErrors { field message }
    }
  }
`;

const LIST_VARIANTS_QUERY = /* GraphQL */ `
  query ListVariants($productId: ID!) {
    product(id: $productId) {
      variants(first: 150) {
        nodes { id title inventoryItem { id } }
      }
    }
  }
`;

async function main() {
  // Variants already created in an earlier run of this script (creation succeeded; only the
  // stock-activation step failed on a missing @idempotent directive) -- re-fetch instead of
  // re-creating to avoid duplicates.
  const listData = await shopifyAdminRequest<any>(LIST_VARIANTS_QUERY, { productId: PRODUCT_ID });
  const created = (listData.product.variants.nodes as Array<{ id: string; title: string; inventoryItem: { id: string } }>)
    .filter((v) => v.title !== 'Flavour 1'); // Flavour 1 already existed before this script ran

  console.log(`Found ${created.length} variants to stock. Setting each to ${STOCK_PER_VARIANT} units...`);

  // Freshly created variants activate at 0 available for this location -- changeFromQuantity: 0
  // matches every one of them, no need to look each one up first.
  const quantities = created.map((v) => ({
    inventoryItemId: v.inventoryItem.id,
    locationId: INVENTORY_LOCATION_ID,
    quantity: STOCK_PER_VARIANT,
    changeFromQuantity: 0,
  }));

  // One batch call for all 99 -- inventorySetQuantities accepts a list of quantities directly.
  const result = await shopifyAdminRequest<any>(INVENTORY_SET_QUANTITIES_MUTATION, {
    key: randomUUID(),
    input: { name: 'available', reason: 'correction', quantities },
  });
  const errors = result.inventorySetQuantities.userErrors ?? [];
  if (errors.length) {
    console.error(`${errors.length} errors:`, errors);
  }
  const ok = result.inventorySetQuantities.inventoryAdjustmentGroup?.changes?.length ?? 0;

  console.log(`\nDone. ${ok / 2} variants stocked at ${STOCK_PER_VARIANT} units (available + on_hand changes each).`);
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
