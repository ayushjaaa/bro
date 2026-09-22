/**
 * Pure stock check for an order. Used by createDraftOrder, the real order boundary.
 *
 * Only variants that are BOTH inventory-tracked AND set to "stop selling when out of stock" (policy
 * DENY) are limited. A variant that isn't tracked, or is set to "continue selling", is sold on
 * backorder by design and is never rejected here. Quantities for the same variant appearing on more
 * than one line are added together first.
 *
 * Shopify draft orders do NOT reserve stock, so this is a point-in-time guard against ordering more
 * than exists right now -- not a hold. Two buyers can still race for the last units.
 */
export interface VariantStock {
  productTitle: string;
  tracked: boolean;
  policy: 'DENY' | 'CONTINUE';
  quantity: number;
}

export interface StockShortfall {
  variantId: string;
  productTitle: string;
  requested: number;
  available: number;
}

export function findStockShortfalls(
  lines: Array<{ variantId: string; quantity: number }>,
  stock: Map<string, VariantStock>
): StockShortfall[] {
  const requestedByVariant = new Map<string, number>();
  for (const line of lines) {
    requestedByVariant.set(line.variantId, (requestedByVariant.get(line.variantId) ?? 0) + line.quantity);
  }

  const shortfalls: StockShortfall[] = [];
  for (const [variantId, requested] of requestedByVariant) {
    const info = stock.get(variantId);
    if (!info || !info.tracked || info.policy !== 'DENY') continue;
    const available = Math.max(0, info.quantity);
    if (requested > available) {
      shortfalls.push({ variantId, productTitle: info.productTitle, requested, available });
    }
  }
  return shortfalls;
}

export function describeShortfalls(shortfalls: StockShortfall[]): string {
  return shortfalls
    .map((s) => (s.available === 0 ? `${s.productTitle} (out of stock)` : `${s.productTitle} (only ${s.available} available)`))
    .join(', ');
}
