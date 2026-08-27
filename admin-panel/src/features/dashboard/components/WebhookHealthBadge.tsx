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

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${health.healthy ? 'bg-dash-success' : 'bg-dash-danger'}`} />
      <span className={health.healthy ? 'text-dash-success' : 'text-dash-danger'}>
        {health.healthy
          ? 'Live sync connected'
          : `Live sync disconnected (${health.missingTopics.length} webhook${health.missingTopics.length === 1 ? '' : 's'} missing)`}
      </span>
    </div>
  );
}
