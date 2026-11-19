/** The one definition of "out of stock" / "low stock" for every Dashboard stock widget (Out of
 * Stock + Low Stock cards, the attention widget and /products/attention list), so they can't drift. */
export const LOW_STOCK_THRESHOLD = 10;

/** Zero OR oversold (negative) -- an oversold Flavour used to fall through both checks and show up
 * as neither out of stock nor low. */
export function isOutOfStock(quantity: number): boolean {
  return quantity <= 0;
}

export function isLowStock(quantity: number): boolean {
  return quantity > 0 && quantity < LOW_STOCK_THRESHOLD;
}
