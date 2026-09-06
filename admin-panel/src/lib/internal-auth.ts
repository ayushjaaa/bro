import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Shared trust-boundary check for every storefront-to-admin-panel internal API route (Draft Order
 * creation, customer order history, ...). These requests carry no admin session at all -- a real
 * customer's checkout or account page, not a logged-in admin -- so the shared secret IS the trust
 * boundary, same reasoning as the inventory webhook route's own doc comment on why it skips
 * requireAdmin() too. Extracted here rather than duplicated per-route since a byte-identical copy
 * of a security-critical check is exactly the kind of thing that should exist in exactly one place.
 */
export function isInternalRequestAuthorized(
  request: NextRequest,
  envVarName = 'INTERNAL_DRAFT_ORDER_SECRET'
): boolean {
  const expected = process.env[envVarName];
  if (!expected) {
    console.error(`[internal-auth] ${envVarName} not set -- refusing all requests`);
    return false;
  }
  const provided = request.headers.get('X-Internal-Secret');
  if (!provided) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
