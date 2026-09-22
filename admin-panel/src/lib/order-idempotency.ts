/**
 * Stops a double-click, a slow-network retry, or two tabs submitting the same cart from creating
 * TWO Shopify Draft Orders for the same customer + line items (O-1). Same in-memory, per-instance
 * pattern already used for webhook delivery dedup (lib/webhooks/verify.ts's WebhookIdDedup) --
 * same accepted limitation: it does not survive a restart or coordinate across multiple server
 * instances, so it is a best-effort guard against the common case (one browser, one request in
 * flight), not a hard guarantee under horizontal scaling.
 *
 * Only a SUCCESSFUL creation is cached under its key -- a genuine failure (out of stock, invalid
 * discount code, a real Shopify error) is removed immediately so the customer can retry right
 * away without waiting out the window. Two concurrent requests with the same key share the exact
 * same in-flight promise (and so the same resulting Draft Order), which is what actually closes
 * the double-click race; the post-success cache additionally covers a slightly-delayed second
 * submit (e.g. a slow retry a few seconds later) within the window.
 */
export class OrderIdempotency<TResult extends { ok: boolean }> {
  private inFlight = new Map<string, { promise: Promise<TResult>; expiresAt: number }>();
  private readonly windowMs: number;

  constructor(windowMs = 20_000) {
    this.windowMs = windowMs;
  }

  private sweep() {
    const now = Date.now();
    for (const [key, entry] of this.inFlight) {
      if (entry.expiresAt <= now) this.inFlight.delete(key);
    }
  }

  /** Runs `create()` under `key`, or returns the still-cached result of a duplicate call. */
  async run(key: string, create: () => Promise<TResult>): Promise<TResult> {
    this.sweep();
    const existing = this.inFlight.get(key);
    if (existing) return existing.promise;

    const promise = create();
    this.inFlight.set(key, { promise, expiresAt: Date.now() + this.windowMs });
    // A failed/errored attempt must not block an immediate legitimate retry.
    promise.then(
      (result) => {
        if (!result.ok) this.inFlight.delete(key);
      },
      () => this.inFlight.delete(key)
    );
    return promise;
  }
}

/** One order = one customer + fulfilment method + the exact set of line items (order-independent). */
export function orderIdempotencyKey(input: {
  customerId: string;
  fulfillmentMethod: string;
  lineItems: Array<{ variantId: string; quantity: number }>;
}): string {
  const lines = [...input.lineItems]
    .sort((a, b) => a.variantId.localeCompare(b.variantId))
    .map((l) => `${l.variantId}x${l.quantity}`)
    .join(',');
  return `${input.customerId}|${input.fulfillmentMethod}|${lines}`;
}
