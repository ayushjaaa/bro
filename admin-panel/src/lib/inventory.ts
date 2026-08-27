/** The client's warehouse location for inventory tracking -- confirmed with the user 2026-08-25:
 * use "My Custom Location" (Toronto, Canada) over Shopify's auto-created "Shop location" (which
 * has no real address, just "United States") since this business is Canada-based; the exact
 * address is a placeholder until the client confirms their real one. Hardcoded rather than looked
 * up by name each call since this is a single-store custom app, not a distributable app -- same
 * pattern as the hardcoded Brand GIDs in scripts/shopify/seed-sample-products.ts. Shared between
 * data/variants.ts (setting/activating quantities) and data/products.ts (checking whether a
 * variant's inventory item is already activated here) so both agree on the same location. */
export const INVENTORY_LOCATION_ID = 'gid://shopify/Location/115762495800';
