/**
 * The shipping/billing address a customer chose AT CHECKOUT, saved on the Draft Order itself as an
 * app-owned metafield.
 *
 * Why not just read the Draft Order's own shippingAddress back: this store's Shopify plan (Basic)
 * blocks reading address1/address2/zip/name through the Admin API (Protected Customer Data -- see
 * getDraftOrderDetail in customer-orders.ts). Without this copy the invoice could only show city +
 * province, and the old fallback filled the street/postal code from the customer's REGISTRATION
 * address, which is wrong whenever they ship to a different saved location. Metafields aren't
 * covered by that restriction, and an `$app` namespace keeps it out of staff's "Additional
 * details" panel (unlike customAttributes).
 *
 * Orders placed before this existed have no snapshot -- the invoice then shows only what Shopify
 * returns (city/province/country), never a mix with another address.
 */
export const ADDRESS_SNAPSHOT_NAMESPACE = '$app';
export const ADDRESS_SNAPSHOT_KEY = 'order_addresses';

export type SnapshotAddress = {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  provinceCode: string;
  zip: string;
  countryCode: string;
};

export type AddressSnapshot = {
  shipping: SnapshotAddress | null;
  billing: SnapshotAddress | null;
};

export function addressSnapshotMetafield(snapshot: AddressSnapshot) {
  return {
    namespace: ADDRESS_SNAPSHOT_NAMESPACE,
    key: ADDRESS_SNAPSHOT_KEY,
    type: 'json',
    value: JSON.stringify(snapshot),
  };
}

function isAddress(value: unknown): value is SnapshotAddress {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  return ['address1', 'city', 'provinceCode', 'zip'].every((k) => typeof a[k] === 'string');
}

/** Never throws -- a missing or malformed value just means "no snapshot". */
export function parseAddressSnapshot(raw: string | null | undefined): AddressSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      shipping: isAddress(parsed.shipping) ? parsed.shipping : null,
      billing: isAddress(parsed.billing) ? parsed.billing : null,
    };
  } catch {
    return null;
  }
}
