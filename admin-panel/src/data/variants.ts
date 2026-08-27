import 'server-only';
import { randomUUID } from 'node:crypto';
import { shopifyAdminRequest, ShopifyAdminApiError } from '@/lib/shopify/admin-client';
import { uploadImageForProductMedia } from '@/lib/shopify/upload-image';
import { requireAdmin } from './admin-auth';
import { REGIONS } from '@/lib/regions';
import { INVENTORY_LOCATION_ID } from '@/lib/inventory';

export { REGIONS };

/**
 * Bulk Variant Upload DAL (Flow C, ADMIN_PANEL_IMPLEMENTATION.md §5 Flow C). Region is a fixed,
 * 6-value list (Canada's excise-stamp regions, §0 fact 2, defined in @/lib/regions since this
 * file is server-only but the value list must also be importable from client components) --
 * never free text, since a typo'd region silently breaks storefront filtering. Region is NOT a
 * formal Shopify Option (only "Flavor" is, per the user's explicit variant-limit constraint), so
 * each variant's option value is `"<flavour name> (<region>)"` to keep Shopify's
 * per-option-value uniqueness requirement satisfied -- proven pattern from
 * scripts/shopify/_tmp-scale-test.ts (1,200/1,200 created with 0 errors). Region + Flavour
 * Description are set as ProductVariant metafields in the same call.
 */

export type VariantRow = {
  flavourName: string;
  description: string;
  region: string;
  price: string;
  compareAtPrice?: string;
  sku?: string;
  quantity?: string;
  image?: File;
};

const BATCH_SIZE = 100;

// strategy: REMOVE_STANDALONE_VARIANT -- not DEFAULT. DEFAULT only auto-deletes Shopify's own
// generic "Default Title" placeholder; it explicitly PRESERVES a custom-named standalone variant
// (live-verified via introspection 2026-08-25) -- and createProductLine() deliberately gives the
// placeholder a custom name ("Flavor": "Default", not Shopify's generic unnamed case) so the
// Option is called "Flavor" from the start. REMOVE_STANDALONE_VARIANT deletes either kind, which
// is what actually cleans up the placeholder once real flavours are added. Safe to always pass:
// it only has an effect when exactly one variant exists before this call, so later batches (where
// several real variants already exist) are unaffected.
const BULK_CREATE_MUTATION = /* GraphQL */ `
  mutation BulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(
      productId: $productId
      variants: $variants
      strategy: REMOVE_STANDALONE_VARIANT
    ) {
      productVariants {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CREATE_MEDIA_MUTATION = /* GraphQL */ `
  mutation CreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        id
      }
      mediaUserErrors {
        field
        message
      }
    }
  }
`;

/**
 * Uploads a variant's image and returns a MediaImage GID for `ProductVariantsBulkInput.mediaId`.
 * Live-verified (2026-08-24) that `mediaSrc` (a plain URL) does NOT reliably attach an image on
 * `productVariantsBulkCreate` -- even a URL matching an already-READY product media came back
 * `image: null`. Only `mediaId` (the MediaImage's own GID) worked. So the image must first be
 * registered as PRODUCT-level media (`productCreateMedia`) before it can be assigned to a variant.
 */
async function uploadVariantImage(productId: string, file: File): Promise<string> {
  const resourceUrl = await uploadImageForProductMedia(file);
  const data = await shopifyAdminRequest<any>(CREATE_MEDIA_MUTATION, {
    productId,
    media: [{ originalSource: resourceUrl, mediaContentType: 'IMAGE' }],
  });
  const errors = data.productCreateMedia.mediaUserErrors;
  if (errors && errors.length > 0) {
    throw new Error(`productCreateMedia failed: ${errors.map((e: any) => e.message).join(', ')}`);
  }
  const mediaId = data.productCreateMedia.media?.[0]?.id;
  if (!mediaId) throw new Error('productCreateMedia returned no media and no errors');
  return mediaId;
}

async function buildVariantInput(
  productId: string,
  row: VariantRow
): Promise<Record<string, unknown>> {
  const metafields = [
    { namespace: 'custom', key: 'region', type: 'single_line_text_field', value: row.region },
    {
      namespace: 'custom',
      key: 'flavour_description',
      type: 'multi_line_text_field',
      value: row.description,
    },
  ];

  const input: Record<string, unknown> = {
    optionValues: [{ name: `${row.flavourName} (${row.region})`, optionName: 'Flavor' }],
    price: row.price,
    metafields,
    // inventoryPolicy: DENY (Shopify's default, left implicit) -- once real quantity tracking is
    // on, stock should genuinely stop sales at 0 rather than oversell (§ user decision 2026-08-25:
    // "track everything", not the CONTINUE-regardless-of-stock approach).
    inventoryQuantities: [
      { availableQuantity: parseInt(row.quantity || '0', 10) || 0, locationId: INVENTORY_LOCATION_ID },
    ],
  };
  if (row.compareAtPrice) input.compareAtPrice = row.compareAtPrice;
  if (row.sku) input.sku = row.sku;
  if (row.image) {
    input.mediaId = await uploadVariantImage(productId, row.image);
  }
  return input;
}

export type BulkCreateResult = {
  created: number;
  failed: number;
  errors: Array<{ field: string[] | null; message: string }>;
};

export type VariantUpdateRow = {
  id: string;
  inventoryItemId: string | null;
  description: string;
  region: string;
  price: string;
  compareAtPrice?: string;
  sku?: string;
  quantity?: string;
  /** The quantity Shopify had on record when this row was loaded, before any edit -- required as
   * `changeFromQuantity` for inventorySetQuantities' compare-and-set safety check. */
  currentQuantity?: number;
  /** Whether this variant's inventory item is already activated (has an InventoryLevel) at
   * INVENTORY_LOCATION_ID. Live-verified 2026-08-25: `inventorySetQuantities` on a
   * NOT-yet-activated location silently no-ops (returns 0 userErrors but never creates the
   * level), while `inventoryActivate` on an ALREADY-activated location errors ("Not allowed to
   * set available quantity when the item is already active at the location") -- these are two
   * genuinely different operations, not interchangeable, so the caller must know which applies.
   * True for variants created via this app's own Flow C (which always activates this location at
   * creation time); false for older data seeded before inventory tracking existed. */
  isActivatedAtLocation: boolean;
};

/** Creates flavours (variants) for a Product Line in batches of 100 (proven-safe size,
 * live-tested 1,200/1,200 with 0 errors -- §0 fact). Continues through batch failures so one bad
 * batch doesn't block the rest; all userErrors are collected and returned for the caller to show. */
export async function bulkCreateVariants(
  productId: string,
  rows: VariantRow[]
): Promise<BulkCreateResult> {
  await requireAdmin();

  const result: BulkCreateResult = { created: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batchRows = rows.slice(i, i + BATCH_SIZE);

    try {
      // Building inputs (image uploads included) happens INSIDE the try -- a failed image
      // upload must fail this one batch gracefully, not crash the whole function uncaught and
      // silently drop every later batch's results too.
      const variants = await Promise.all(batchRows.map((row) => buildVariantInput(productId, row)));
      const data = await shopifyAdminRequest<any>(BULK_CREATE_MUTATION, { productId, variants });
      const userErrors = data.productVariantsBulkCreate.userErrors ?? [];
      const createdCount = data.productVariantsBulkCreate.productVariants?.length ?? 0;
      result.created += createdCount;
      result.failed += batchRows.length - createdCount;
      result.errors.push(...userErrors);
    } catch (err) {
      result.failed += batchRows.length;
      // ShopifyAdminApiError's own `.message` is a generic wrapper ("...returned GraphQL
      // errors") -- the actually useful text is in `.errors` (the raw GraphQL error list).
      // Surface that instead so a real cause (e.g. a duplicate option value) is visible, not
      // hidden behind a generic message.
      if (err instanceof ShopifyAdminApiError && Array.isArray(err.errors)) {
        for (const e of err.errors as Array<{ message?: string }>) {
          result.errors.push({ field: null, message: e.message ?? JSON.stringify(e) });
        }
      } else {
        result.errors.push({
          field: null,
          message: err instanceof Error ? err.message : `Batch starting at row ${i + 1} failed`,
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------------------------
// Edit existing Flavours -- one UI serves both a single-Flavour edit and a bulk edit: each row
// carries its own values, and the caller can submit one row or many in the same call (§ user
// request 2026-08-25, "handle both individual and bulk edit").
// ---------------------------------------------------------------------------------------------

const BULK_UPDATE_MUTATION = /* GraphQL */ `
  mutation BulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// As of Shopify API 2026-04, inventorySetQuantities REQUIRES an @idempotent directive (a fresh
// key per call, regenerated each request -- live-verified 2026-08-25: omitting it fails with
// "The @idempotent directive is required for this mutation") and each quantity entry requires
// `changeFromQuantity` (the quantity Shopify currently has on record) for compare-and-set safety
// -- omitting that fails with "must include the following argument: changeFromQuantity".
const SET_QUANTITIES_MUTATION = /* GraphQL */ `
  mutation SetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      userErrors {
        field
        message
      }
    }
  }
`;

// inventoryActivate is the ONLY way to set a quantity the first time a location is used for an
// inventory item -- inventorySetQuantities on a not-yet-activated location silently no-ops
// (verified 2026-08-25: 0 userErrors, but the quantity never actually changes because there's no
// InventoryLevel row there yet to update).
const ACTIVATE_MUTATION = /* GraphQL */ `
  mutation Activate($inventoryItemId: ID!, $locationId: ID!, $available: Int!, $idempotencyKey: String!) {
    inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId, available: $available)
      @idempotent(key: $idempotencyKey) {
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Updates existing Flavours: price/compareAtPrice/sku/region/description via
 * `productVariantsBulkUpdate` (one call, works for 1 row or many the same way), and stock
 * quantity via a SEPARATE mutation (`inventorySetQuantities`) -- unlike creation, an existing
 * variant's stock isn't part of `ProductVariantsBulkInput`; Shopify's inventory-quantity system
 * treats "set the current count" as its own operation, keyed by `inventoryItemId` (confirmed via
 * schema introspection 2026-08-25), not the variant ID.
 */
export async function updateVariants(
  productId: string,
  rows: VariantUpdateRow[]
): Promise<BulkCreateResult> {
  await requireAdmin();

  const result: BulkCreateResult = { created: 0, failed: 0, errors: [] };

  const variants = rows.map((row) => {
    const input: Record<string, unknown> = {
      id: row.id,
      price: row.price,
      metafields: [
        { namespace: 'custom', key: 'region', type: 'single_line_text_field', value: row.region },
        {
          namespace: 'custom',
          key: 'flavour_description',
          type: 'multi_line_text_field',
          value: row.description,
        },
      ],
    };
    if (row.compareAtPrice) input.compareAtPrice = row.compareAtPrice;
    if (row.sku) input.sku = row.sku;
    return input;
  });

  try {
    const data = await shopifyAdminRequest<any>(BULK_UPDATE_MUTATION, { productId, variants });
    const userErrors = data.productVariantsBulkUpdate.userErrors ?? [];
    const updatedCount = data.productVariantsBulkUpdate.productVariants?.length ?? 0;
    result.created += updatedCount;
    result.failed += rows.length - updatedCount;
    result.errors.push(...userErrors);
  } catch (err) {
    result.failed += rows.length;
    if (err instanceof ShopifyAdminApiError && Array.isArray(err.errors)) {
      for (const e of err.errors as Array<{ message?: string }>) {
        result.errors.push({ field: null, message: e.message ?? JSON.stringify(e) });
      }
    } else {
      result.errors.push({ field: null, message: err instanceof Error ? err.message : 'Update failed' });
    }
  }

  const quantityRows = rows.filter((r) => r.quantity !== undefined && r.inventoryItemId);
  const toActivate = quantityRows.filter((r) => !r.isActivatedAtLocation);
  const toSet = quantityRows.filter((r) => r.isActivatedAtLocation);

  // First-time activation, one at a time (inventoryActivate takes a single item, not a batch).
  for (const row of toActivate) {
    try {
      const data = await shopifyAdminRequest<any>(ACTIVATE_MUTATION, {
        inventoryItemId: row.inventoryItemId,
        locationId: INVENTORY_LOCATION_ID,
        available: parseInt(row.quantity || '0', 10) || 0,
        idempotencyKey: randomUUID(),
      });
      const userErrors = data.inventoryActivate.userErrors ?? [];
      if (userErrors.length > 0) result.failed += 1;
      result.errors.push(...userErrors);
    } catch (err) {
      result.failed += 1;
      if (err instanceof ShopifyAdminApiError && Array.isArray(err.errors)) {
        for (const e of err.errors as Array<{ message?: string }>) {
          result.errors.push({ field: null, message: `Quantity activate: ${e.message ?? JSON.stringify(e)}` });
        }
      } else {
        result.errors.push({
          field: null,
          message: `Quantity activate failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        });
      }
    }
  }

  // Already-activated rows can be set together in one batched call.
  if (toSet.length > 0) {
    try {
      const data = await shopifyAdminRequest<any>(SET_QUANTITIES_MUTATION, {
        idempotencyKey: randomUUID(),
        input: {
          reason: 'correction',
          name: 'available',
          quantities: toSet.map((r) => ({
            inventoryItemId: r.inventoryItemId,
            locationId: INVENTORY_LOCATION_ID,
            quantity: parseInt(r.quantity || '0', 10) || 0,
            changeFromQuantity: r.currentQuantity ?? 0,
          })),
        },
      });
      const userErrors = data.inventorySetQuantities.userErrors ?? [];
      if (userErrors.length > 0) {
        // A quantity-set failure must count as a real failure -- previously this branch only
        // pushed the error message without incrementing `result.failed`, so the caller (and the
        // UI) reported "Updated N, failed 0" even though stock silently never changed.
        result.failed += toSet.length;
      }
      result.errors.push(...userErrors);
    } catch (err) {
      result.failed += toSet.length;
      if (err instanceof ShopifyAdminApiError && Array.isArray(err.errors)) {
        for (const e of err.errors as Array<{ message?: string }>) {
          result.errors.push({ field: null, message: `Quantity update: ${e.message ?? JSON.stringify(e)}` });
        }
      } else {
        result.errors.push({
          field: null,
          message: `Quantity update failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------------------------
// Add Stock (restock) -- a relative "+N" adjustment, distinct from Edit Flavours' "set to N"
// (§ user request 2026-08-25: "if a flavour had 20 and we get 20 more, can we add 20 without
// calculating the new total ourselves?"). Shopify has a dedicated mutation for exactly this,
// `inventoryAdjustQuantities` (a `delta`, not an absolute value) -- separate from
// `inventorySetQuantities` used by updateVariants() above. Requires the same @idempotent
// directive and a `changeFromQuantity` baseline as the other 2026-04+ inventory mutations
// (live-verified 2026-08-25). Only usable on a variant already activated at
// INVENTORY_LOCATION_ID -- a brand-new, never-stocked variant should use Edit Flavours' quantity
// field (which activates) first, not this.
// ---------------------------------------------------------------------------------------------

const ADJUST_QUANTITY_MUTATION = /* GraphQL */ `
  mutation AdjustQuantity($input: InventoryAdjustQuantitiesInput!, $idempotencyKey: String!) {
    inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      userErrors {
        field
        message
      }
    }
  }
`;

/** Adds (or, with a negative delta, removes) stock relative to the current quantity -- e.g. "+20
 * just arrived" without the caller needing to know/compute the new total themselves. */
export async function adjustVariantQuantity(
  inventoryItemId: string,
  delta: number,
  currentQuantity: number
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  try {
    const data = await shopifyAdminRequest<any>(ADJUST_QUANTITY_MUTATION, {
      idempotencyKey: randomUUID(),
      input: {
        reason: 'correction',
        name: 'available',
        changes: [
          {
            delta,
            inventoryItemId,
            locationId: INVENTORY_LOCATION_ID,
            changeFromQuantity: currentQuantity,
          },
        ],
      },
    });
    const userErrors = data.inventoryAdjustQuantities.userErrors ?? [];
    if (userErrors.length > 0) {
      return { ok: false, error: userErrors.map((e: any) => e.message).join(', ') };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof ShopifyAdminApiError && Array.isArray(err.errors)) {
      const messages = (err.errors as Array<{ message?: string }>).map((e) => e.message).join(', ');
      return { ok: false, error: messages };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Adjust quantity failed' };
  }
}
