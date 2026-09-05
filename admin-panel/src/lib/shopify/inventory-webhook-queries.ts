import 'server-only';
import { shopifyAdminRequest, ShopifyAdminApiError } from './admin-client';

/**
 * INTENTIONAL EXCEPTION to the src/data/*.ts convention: every function there calls
 * requireAdmin() first because it's driven by an authenticated admin's own request. This function
 * is different -- it's called from the inventory webhook route (src/app/api/webhooks/inventory/
 * route.ts), which has no admin session at all (Shopify's server is calling us, not our own
 * logged-in admin). Its trust boundary is HMAC verification (done by the route before this is
 * ever called), not a Supabase session -- so it deliberately does NOT call requireAdmin(), and
 * must never be wired into any requireAdmin()-gated caller either. Do not "fix" this by adding
 * requireAdmin() here.
 *
 * Never trust a webhook payload's own `available` value (Shopify has a documented bug where it
 * can be empty/wrong if multiple inventory items change close together) -- this always re-queries
 * Shopify directly for the authoritative current quantity of one item at one location.
 */
// `variant { product { handle } }` added alongside quantity in this SAME query -- no separate
// Shopify call needed to later resolve which storefront product page to invalidate (the
// inventory_levels/update webhook itself only ever carries an anonymous inventory_item_id, never
// a product reference; see the inventory webhook route's doc comment).
const GET_INVENTORY_LEVEL_QUERY = /* GraphQL */ `
  query GetInventoryLevel($inventoryItemId: ID!, $locationId: ID!) {
    inventoryItem(id: $inventoryItemId) {
      inventoryLevel(locationId: $locationId) {
        quantities(names: ["available"]) {
          name
          quantity
        }
      }
      variant {
        product {
          handle
        }
      }
    }
  }
`;

export type InventoryLevelResult = {
  quantity: number;
  handle: string | null;
};

export async function getCurrentAvailableQuantity(
  inventoryItemId: string,
  locationId: string
): Promise<InventoryLevelResult | null> {
  try {
    const data = await shopifyAdminRequest<any>(GET_INVENTORY_LEVEL_QUERY, {
      inventoryItemId,
      locationId,
    });
    const quantities = data.inventoryItem?.inventoryLevel?.quantities ?? [];
    const available = quantities.find((q: any) => q.name === 'available');
    if (typeof available?.quantity !== 'number') return null;
    return {
      quantity: available.quantity,
      handle: data.inventoryItem?.variant?.product?.handle ?? null,
    };
  } catch (err) {
    console.error(
      '[inventory-webhook] Shopify re-query failed:',
      err instanceof ShopifyAdminApiError ? err.errors : err
    );
    return null; // caller must treat null as "skip this write", never as "0"
  }
}
