/**
 * Server-side province -> product-region rule for orders. The `region` cookie is only a display
 * filter the visitor controls; THIS is what an order is checked against, using the shipping
 * province the customer actually submitted.
 *
 * ASSUMED RULE (confirm with whoever owns compliance -- change only this table):
 *   BC / AB / MB / ON / QC  -> only that province's own `region-<x>` products
 *   every other province / territory -> only `region-federal` products
 *   a product with no `region-` tag  -> allowed anywhere
 *
 * NOTE: storefront/src/lib/region-rules.ts is a copy of this file (the two apps share no code).
 * Keep them identical.
 */
const PROVINCES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

/** Provinces that have their own region; everything else falls back to `federal`. */
const PROVINCE_OWN_REGION: Record<string, string> = {
  BC: 'bc',
  AB: 'alberta',
  MB: 'manitoba',
  ON: 'ontario',
  QC: 'quebec',
};

/**
 * Business decision (2026-09-22): province -> product-region shipping restriction is DISABLED.
 * Every function below still works exactly as before -- only the two order boundaries
 * (storefront checkout/actions.ts, admin-panel lib/shopify/draft-orders.ts) stop calling
 * findRegionMismatches()/blocking on it while this is false. Flip it back to `true` (only this
 * line) if a real compliance requirement (e.g. provincial vaping-product marking) reinstates the
 * rule -- do not re-derive the logic from scratch.
 */
export const REGION_RULE_ENABLED = false;

export const FALLBACK_REGION = 'federal';

/** Accepts a 2-letter code ("ON") or the full name ("Ontario", also "Québec"); returns the code or null. */
export function normalizeProvince(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return null;
  const plain = value.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const upper = plain.toUpperCase();
  const byCode = PROVINCES.find((p) => p.code === upper);
  if (byCode) return byCode.code;
  const byName = PROVINCES.find((p) => p.name.toUpperCase() === upper);
  return byName ? byName.code : null;
}

/** The one region an order shipping to this province may contain (besides untagged products). */
export function requiredRegionForProvince(provinceCode: string): string {
  return PROVINCE_OWN_REGION[provinceCode] ?? FALLBACK_REGION;
}

export function isRegionAllowedForProvince(productRegion: string | null, provinceCode: string): boolean {
  if (productRegion === null) return true;
  return productRegion === requiredRegionForProvince(provinceCode);
}

/** The lines that may NOT ship to this province. Empty array = the whole order is allowed. */
export function findRegionMismatches<T extends { region: string | null }>(lines: T[], provinceCode: string): T[] {
  return lines.filter((line) => !isRegionAllowedForProvince(line.region, provinceCode));
}
