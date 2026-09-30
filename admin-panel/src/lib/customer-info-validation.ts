import { normalizeProvince } from './region-rules';

/**
 * Server-side checks for an admin editing a customer's application info (030-approval-race-
 * guards.sql covers status; 031-customer-info-versioning.sql covers this). Admin-panel had no
 * validation utility for these fields before this -- mirrors the rules the storefront's own
 * registration wizard already enforces at signup (application-validation.ts, a separate repo, so
 * not importable directly) so an admin's edit can't leave a record in a worse state than a fresh
 * application would have been allowed to.
 */
export const MAX_TEXT_LENGTH = 300;

const CA_POSTAL_PATTERN = /^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVXY][ \-]?\d[ABCEGHJKLMNPRSTVXY]\d$/i;

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

/** Only the fields actually present in `fields` are checked -- this is a partial update, so a
 * field the admin didn't touch shouldn't be required just because it's normally required at
 * signup. Required-field checks apply only when that field is explicitly being set to empty. */
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
    if (key in fields && !String(fields[key] ?? '').trim()) {
      return `${label.charAt(0).toUpperCase()}${label.slice(1)} cannot be empty.`;
    }
  }

  if (fields.shipProvince !== undefined && normalizeProvince(fields.shipProvince) === null) {
    return 'Please choose a valid shipping province.';
  }
  if (fields.shipPostalCode !== undefined && !CA_POSTAL_PATTERN.test(fields.shipPostalCode.trim())) {
    return 'Please enter a valid Canadian shipping postal code.';
  }
  if (fields.billProvince) {
    if (normalizeProvince(fields.billProvince) === null) return 'Please choose a valid billing province.';
  }
  if (fields.billPostalCode) {
    if (!CA_POSTAL_PATTERN.test(fields.billPostalCode.trim())) {
      return 'Please enter a valid Canadian billing postal code.';
    }
  }

  if (fields.numStores !== undefined && fields.numStores !== null) {
    if (!Number.isFinite(fields.numStores) || fields.numStores < 0 || fields.numStores > 100000) {
      return 'Number of stores is not valid.';
    }
  }

  if (fields.businessTypes && fields.businessTypes.length > 20) {
    return 'Too many business types selected.';
  }

  return null;
}
