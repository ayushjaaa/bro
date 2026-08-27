import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verifies a Shopify webhook's HMAC-SHA256 signature -- shared by every webhook route in this
 * app (inventory, products). Must be called on the RAW request body, before any JSON parsing, or
 * the signature check breaks (Shopify signs the exact bytes it sent). */
export async function verifyShopifyHmac(rawBody: string, hmacHeader: string | null): Promise<boolean> {
  if (!hmacHeader) return false;
  const secret = process.env.SHOPIFY_CLIENT_SECRET!;
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Dedupes genuine Shopify retries (same X-Shopify-Webhook-Id redelivered) -- Shopify retries a
 * failed delivery for up to ~4h with backoff, so a 5h TTL (a safety margin over that window)
 * means a real retry is skipped entirely: no re-processing, no duplicate side effects. Per-route
 * instance (each webhook route should create its own), single-process in-memory state -- fine for
 * this app today; see the plan doc for the multi-instance caveat if this ever changes. */
export class WebhookIdDedup {
  private seen = new Map<string, number>(); // webhookId -> expiresAt (ms epoch)
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /** Returns true if this id was already seen (and not yet expired) -- caller should skip
   * processing. Also opportunistically sweeps expired entries and records a first-seen id. */
  isDuplicate(webhookId: string | null): boolean {
    const now = Date.now();
    for (const [id, expiresAt] of this.seen) {
      if (expiresAt <= now) this.seen.delete(id);
    }
    if (!webhookId) return false;
    if (this.seen.has(webhookId)) return true;
    this.seen.set(webhookId, now + this.ttlMs);
    return false;
  }
}
