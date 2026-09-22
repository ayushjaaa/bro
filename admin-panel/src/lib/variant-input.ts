/**
 * Q-3: same "reject junk before it's stored" treatment as `taxonomy-input.ts`, applied to bulk
 * Flavour (variant) create/edit -- `flavourName` becomes the variant's option value and
 * `description` becomes the `custom.flavour_description` metafield. Pure -- unit-tested.
 */
const FLAVOUR_NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 2000;
const NO_CONTROL_CHARS_EXCEPT_NEWLINE = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/;

export function validateVariantDescription(description: string): string | null {
  if (typeof description !== 'string') return null;
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return `Description is too long (max ${DESCRIPTION_MAX_LENGTH} characters).`;
  }
  if (!NO_CONTROL_CHARS_EXCEPT_NEWLINE.test(description)) {
    return 'Description contains invalid characters.';
  }
  return null;
}

/** A3 (PRODUCT_ERROR_HANDLING_REVIEW.md): shared price/quantity checks -- extracted so
 * `VariantBulkTable.tsx` (create flow) and `EditVariantsTable.tsx` (edit flow) validate the exact
 * same rule instead of one having it and the other silently accepting anything. A $0 Flavour or
 * one with a non-integer/negative stock isn't a real sellable state; matches the thresholds
 * `data/variants.ts`'s server-side checks now also enforce (defense in depth -- client validation
 * alone is bypassable via direct POST). */
export function validatePriceInput(raw: string): string | null {
  if (!raw.trim()) return 'Required';
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 'Must be > 0';
  return null;
}

export function validateQuantityInput(raw: string): string | null {
  if (!raw.trim()) return 'Required';
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return 'Must be > 0';
  return null;
}

/** Used at creation time, where the Flavour name (the variant's option value) is also being set
 * for the first time -- `updateVariants` doesn't rename a Flavour, so it only needs
 * `validateVariantDescription` above. */
export function validateVariantRowInput(row: { flavourName: string; description: string }): string | null {
  if (typeof row.flavourName !== 'string' || row.flavourName.trim().length === 0) {
    return 'Flavour name is required.';
  }
  if (row.flavourName.length > FLAVOUR_NAME_MAX_LENGTH) {
    return `Flavour name is too long (max ${FLAVOUR_NAME_MAX_LENGTH} characters).`;
  }
  if (!NO_CONTROL_CHARS_EXCEPT_NEWLINE.test(row.flavourName)) {
    return 'Flavour name contains invalid characters.';
  }
  return validateVariantDescription(row.description);
}
