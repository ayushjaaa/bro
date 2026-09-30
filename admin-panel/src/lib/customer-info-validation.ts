import { normalizeProvince } from './region-rules';

/**
 * Server-side checks for an admin editing a customer's application info (030-approval-race-
 * guards.sql covers status; 031-customer-info-versioning.sql covers this). Admin-panel had no
 * validation utility for these fields before this -- mirrors the rules the storefront's own
 * registration wizard already enforces at signup (application-validation.ts + features/apply/
 * data.ts + features/retail/data.ts, a separate repo, so not importable directly -- copied by
 * value, confirmed identical between the wholesale and retail wizards) so an admin's edit can't
 * leave a record in a worse, less-validated state than a fresh application would ever be allowed
 * into. Covers every editable field with a real format, not just the handful that had checks
 * before (required fields, postal code, province, numStores) -- found incomplete via user
 * feedback after the first pass only covered those four.
 */
export const MAX_TEXT_LENGTH = 300;

const CA_POSTAL_PATTERN = /^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVXY][ \-]?\d[ABCEGHJKLMNPRSTVXY]\d$/i;
// Digits, spaces, and the usual separators -- deliberately loose (not strict E.164) since this
// covers however a real applicant/admin actually types a phone number ("(555) 123-4567",
// "555-123-4567", "+1 555 123 4567" all pass); just needs a plausible digit count either side.
const PHONE_PATTERN = /^[\d\s().+-]{7,20}$/;
// Instagram's own handle rules: letters, digits, underscore, period, max 30 chars, no spaces.
const INSTAGRAM_PATTERN = /^@?[A-Za-z0-9_.]{1,30}$/;
// Canada Business Number: 9 digits, optionally followed by a program identifier like "RT0001" --
// loose enough to accept either the bare 9-digit BN or the full BN+program-account form, with or
// without spaces, since real applicants provide both styles.
const BUSINESS_NUMBER_PATTERN = /^\d{9}(\s?[A-Z]{2}\d{4})?$/i;

// Copied by value from storefront's features/apply/data.ts (identical in features/retail/data.ts)
// -- these are the exact option sets the registration wizard's dropdowns restrict a fresh
// applicant to, so an admin's later edit is held to the same standard, not left free-text.
export const BUSINESS_TYPES = [
  'Convenience Store', 'Smoke Shop', 'Cigar Store', 'Headshop', 'Novelty And Gift',
  'Hybrid Vape Store', 'Gas Station', 'Sub-Distributor', 'Distributor', 'Adult Store',
  'E-commerce', 'Cannabis Store', 'Licence Producer', 'Specialty Vape Store', 'Other(s)',
] as const;
export const MONTHLY_PURCHASE_RANGES = [
  'Under $2,500', '$2,500 - $5,000', '$5,000 - $10,000', '$10,000 - $25,000', '$25,000+',
] as const;
export const REFERRAL_SOURCES = [
  'Google Search', 'Social Media', 'Referral from another retailer', 'Trade Show', 'Sales Rep', 'Other',
] as const;

export type CustomerInfoFields = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  personalCell?: string | null;
  legalBusinessName?: string;
  operatingName?: string | null;
  businessNumber?: string | null;
  numStores?: number | null;
  businessTypes?: string[] | null;
  monthlyPurchaseRange?: string | null;
  sellsOnline?: boolean | null;
  onlineUrl?: string | null;
  instagramHandle?: string | null;
  shipLine1?: string;
  shipLine2?: string | null;
  shipCity?: string;
  shipProvince?: string;
  shipPostalCode?: string;
  billSameAsShipping?: boolean | null;
  billLine1?: string | null;
  billLine2?: string | null;
  billCity?: string | null;
  billProvince?: string | null;
  billPostalCode?: string | null;
  taxExempt?: boolean | null;
  referralSource?: string | null;
};

/** True for "the field is present but genuinely empty" -- used throughout so an admin CLEARING an
 * optional field (e.g. deleting a phone number they know is wrong, with nothing to replace it
 * yet) never gets blocked by a format check meant for a real value. Format rules below only apply
 * once the field actually has content. */
function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

/** Only the fields actually present in `fields` are checked -- this is a partial update (and also
 * how per-field, on-blur validation calls this with a single-key object), so a field the admin
 * didn't touch shouldn't be required just because it's normally required at signup. Required-
 * field checks apply only when that field is explicitly being set to empty; format checks apply
 * only when the field has content (see `isBlank`) -- an optional field being cleared is never an
 * error. */
export function validateCustomerInfoUpdate(fields: CustomerInfoFields): string | null {
  for (const value of Object.values(fields)) {
    if (typeof value === 'string' && value.length > MAX_TEXT_LENGTH) {
      return 'One of the fields is too long -- please shorten it and try again.';
    }
  }

  const requiredIfPresent: [key: keyof CustomerInfoFields, label: string][] = [
    ['firstName', 'first name'],
    ['lastName', 'last name'],
    ['legalBusinessName', 'legal business name'],
    ['shipLine1', 'shipping address'],
    ['shipCity', 'shipping city'],
    ['shipProvince', 'shipping province'],
    ['shipPostalCode', 'shipping postal code'],
  ];
  for (const [key, label] of requiredIfPresent) {
    if (key in fields && isBlank(fields[key])) {
      return `${label.charAt(0).toUpperCase()}${label.slice(1)} cannot be empty.`;
    }
  }

  if (fields.shipProvince !== undefined && normalizeProvince(fields.shipProvince) === null) {
    return 'Please choose a valid shipping province.';
  }
  if (fields.shipPostalCode !== undefined && !CA_POSTAL_PATTERN.test(fields.shipPostalCode.trim())) {
    return 'Please enter a valid Canadian shipping postal code.';
  }
  if (fields.billProvince !== undefined && !isBlank(fields.billProvince) && normalizeProvince(fields.billProvince) === null) {
    return 'Please choose a valid billing province.';
  }
  if (fields.billPostalCode !== undefined && !isBlank(fields.billPostalCode) && !CA_POSTAL_PATTERN.test(fields.billPostalCode!.trim())) {
    return 'Please enter a valid Canadian billing postal code.';
  }

  if (fields.phone !== undefined && !isBlank(fields.phone) && !PHONE_PATTERN.test(fields.phone!.trim())) {
    return 'Please enter a valid business phone number.';
  }
  if (fields.personalCell !== undefined && !isBlank(fields.personalCell) && !PHONE_PATTERN.test(fields.personalCell!.trim())) {
    return 'Please enter a valid personal cell number.';
  }

  if (fields.businessNumber !== undefined && !isBlank(fields.businessNumber) && !BUSINESS_NUMBER_PATTERN.test(fields.businessNumber!.trim())) {
    return 'Please enter a valid Canada Business Number (9 digits, optionally followed by a program account like RT0001).';
  }

  if (fields.onlineUrl !== undefined && !isBlank(fields.onlineUrl)) {
    try {
      const url = new URL(fields.onlineUrl!.trim().match(/^https?:\/\//i) ? fields.onlineUrl!.trim() : `https://${fields.onlineUrl!.trim()}`);
      if (!url.hostname.includes('.')) throw new Error('no TLD');
    } catch {
      return 'Please enter a valid online store URL.';
    }
  }

  if (fields.instagramHandle !== undefined && !isBlank(fields.instagramHandle) && !INSTAGRAM_PATTERN.test(fields.instagramHandle!.trim())) {
    return 'Please enter a valid Instagram handle (letters, numbers, underscores and periods only).';
  }

  if (fields.numStores !== undefined && fields.numStores !== null) {
    if (!Number.isFinite(fields.numStores) || fields.numStores < 0 || fields.numStores > 100000) {
      return 'Number of stores is not valid.';
    }
  }

  if (fields.businessTypes) {
    if (fields.businessTypes.length > 20) return 'Too many business types selected.';
    const invalidType = fields.businessTypes.find((t) => !(BUSINESS_TYPES as readonly string[]).includes(t));
    if (invalidType) return `"${invalidType}" is not a recognized business type.`;
  }

  if (
    fields.monthlyPurchaseRange !== undefined &&
    !isBlank(fields.monthlyPurchaseRange) &&
    !(MONTHLY_PURCHASE_RANGES as readonly string[]).includes(fields.monthlyPurchaseRange!)
  ) {
    return 'Please choose a valid expected monthly purchase range.';
  }

  if (
    fields.referralSource !== undefined &&
    !isBlank(fields.referralSource) &&
    !(REFERRAL_SOURCES as readonly string[]).includes(fields.referralSource!)
  ) {
    return 'Please choose a valid referral source.';
  }

  return null;
}
