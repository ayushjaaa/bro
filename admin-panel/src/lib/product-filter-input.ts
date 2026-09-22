/**
 * Q-1: `createProductLine`'s `filterValues` keys arrive as `filter:<key>` FormData entries -- a
 * Server Action is a public endpoint (reachable by direct POST, not just the form), so a forged
 * key must never be trusted to become a `custom.<key>` metafield unchecked. "region" is
 * structural (the caller sets its own `custom.region` metafield separately, once per Product
 * Line) -- letting it also arrive through `filterValues` would push a SECOND `custom.region`
 * metafield onto the same product in the same call, an undefined state Shopify was never meant
 * to receive. Anything else must match a real, known filter key -- not just any key someone
 * chooses to send. Pure -- unit-tested.
 */
export const RESERVED_FILTER_KEYS = new Set(['region']);

export function validateFilterKeys(filterValues: Record<string, string>, knownKeys: Set<string>): string | null {
  for (const key of Object.keys(filterValues)) {
    if (RESERVED_FILTER_KEYS.has(key)) {
      return `"${key}" is a reserved field and cannot be set as a custom filter.`;
    }
    if (!knownKeys.has(key)) {
      return `Unknown filter key: "${key}"`;
    }
  }
  return null;
}
