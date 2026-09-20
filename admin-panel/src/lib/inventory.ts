/** The client's warehouse location for inventory tracking -- updated for the migration to the
 * "Gemini Distribution" store (gemini-distribution-1begj051.myshopify.com), which has a single
 * location, Shopify's auto-created "Shop location" (country: Canada, full street address not yet
 * filled in by the client). Hardcoded rather than looked up by name each call since this is a
 * single-store custom app, not a distributable app -- same pattern as the hardcoded Brand GIDs in
 * scripts/shopify/seed-testing-products.ts. Shared between data/variants.ts (setting/activating
 * quantities) and data/products.ts (checking whether a variant's inventory item is already
 * activated here) so both agree on the same location. */
export const INVENTORY_LOCATION_ID = 'gid://shopify/Location/84994621638';
