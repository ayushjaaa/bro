'use client';

import { useEffect, useState } from 'react';
import { checkWebhookHealthAction } from '../actions';
import type { WebhookHealth } from '@/data/webhook-health';

const POLL_INTERVAL_MS = 2 * 60 * 1000;

/** No webhook exists for "someone deleted a webhook subscription in Shopify admin" or "the ngrok
 * tunnel died" -- there's nothing to push here, so this polls a cheap Server Action every couple
 * of minutes instead of subscribing to anything, self-updating without a full page reload. */
export default function WebhookHealthBadge({ initial }: { initial: WebhookHealth }) {
  const [health, setHealth] = useState(initial);

  useEffect(() => {
    const intervalId = setInterval(async () => {
      try {
        setHealth(await checkWebhookHealthAction());
      } catch {
        // Leave the last known state showing rather than flashing an error for a transient failure.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  const pillClass = health.healthy
    ? 'bg-dash-pill-success-bg text-dash-pill-success-text border-dash-pill-success-text/20'
    : 'bg-dash-pill-danger-bg text-dash-pill-danger-text border-dash-pill-danger-text/20';
  const dotClass = health.healthy ? 'bg-dash-success' : 'bg-dash-danger';

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${pillClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {health.healthy
        ? 'Live sync connected'
        : `Live sync disconnected (${health.missingTopics.length} webhook${health.missingTopics.length === 1 ? '' : 's'} missing)`}
    </div>
  );
}
