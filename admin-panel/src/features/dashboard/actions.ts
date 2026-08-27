'use server';

import { checkWebhookHealth, type WebhookHealth } from '@/data/webhook-health';

/** Thin Server Action -- the WebhookHealthBadge client component re-invokes this every couple of
 * minutes to self-update without a full page reload (see its own comment for why this can't be
 * pushed live like everything else on the dashboard). */
export async function checkWebhookHealthAction(): Promise<WebhookHealth> {
  return checkWebhookHealth();
}
