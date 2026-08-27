/**
 * One-time backfill: existing inventory items predate the store_stock_totals/out_of_stock_items/
 * low_stock_items aggregate tables (003), so those would start at 0/empty until each item's stock
 * next changes. This upserts each variant's real current quantity directly into inventory_snapshot
 * (a plain upsert, NOT the delta-based sync_inventory_and_aggregates RPC -- that one computes a
 * delta against the existing row, which would be 0 for an already-correct snapshot and never
 * seed the totals), then calls recompute_all_stock_aggregates() once at the end to derive the
 * three aggregate tables from the now-accurate inventory_snapshot table.
 *
 * Run: npm run shopify:backfill-stock-aggregates
 */
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { INVENTORY_LOCATION_ID } from '../../src/lib/inventory';

const LIST_QUERY = /* GraphQL */ `
  query ListAllVariants {
    products(first: 100) {
      nodes {
        variants(first: 250) {
          nodes {
            inventoryItem {
              id
            }
          }
        }
      }
    }
  }
`;

async function main() {
  const supabase = createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const data = await shopifyAdminRequest<any>(LIST_QUERY);
  const inventoryItemIds: string[] = data.products.nodes.flatMap((p: any) =>
    p.variants.nodes.map((v: any) => v.inventoryItem?.id).filter(Boolean)
  );

  console.log(`Found ${inventoryItemIds.length} inventory items. Backfilling...`);

  let ok = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const inventoryItemId of inventoryItemIds) {
    const QUERY = /* GraphQL */ `
      query($id: ID!, $loc: ID!) {
        inventoryItem(id: $id) { inventoryLevel(locationId: $loc) { quantities(names: ["available"]) { quantity } } }
      }
    `;
    const levelData = await shopifyAdminRequest<any>(QUERY, { id: inventoryItemId, loc: INVENTORY_LOCATION_ID });
    const quantity = levelData.inventoryItem?.inventoryLevel?.quantities?.[0]?.quantity;
    if (typeof quantity !== 'number') {
      console.log(`  skip (not activated at this location): ${inventoryItemId}`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from('inventory_snapshot').upsert(
      {
        inventory_item_id: inventoryItemId,
        location_id: INVENTORY_LOCATION_ID,
        quantity,
        shopify_updated_at: now,
        updated_at: now,
      },
      { onConflict: 'inventory_item_id' }
    );
    if (error) {
      console.error(`  upsert failed: ${inventoryItemId}`, error.message);
      continue;
    }
    console.log(`  seeded: ${inventoryItemId} = ${quantity}`);
    ok++;
  }

  console.log('\nRecomputing aggregates from inventory_snapshot...');
  const { error: recomputeError } = await supabase.rpc('recompute_all_stock_aggregates');
  if (recomputeError) throw recomputeError;

  console.log(`Done. Seeded ${ok}, skipped ${skipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
