import 'server-only';
import { shopifyAdminRequest } from '@/lib/shopify/admin-client';
import { requireAdmin } from './admin-auth';

/** Normal requireAdmin()-gated DAL (unlike the *-webhook-queries.ts files, which are triggered BY
 * a webhook and have no admin session) -- this is called FROM the dashboard, by a logged-in
 * admin, to check whether the live-sync webhooks are currently registered. There's no webhook for
 * "someone deleted a webhook subscription in Shopify admin," so this can't be pushed live the way
 * everything else on the dashboard is -- it's checked fresh here, and the client re-invokes this
 * via a Server Action every couple of minutes to self-update without a full page reload. */

const EXPECTED_TOPICS = ['INVENTORY_LEVELS_UPDATE', 'PRODUCTS_CREATE', 'PRODUCTS_UPDATE', 'PRODUCTS_DELETE'];

const LIST_QUERY = /* GraphQL */ `
  query CheckWebhookHealth($topics: [WebhookSubscriptionTopic!]) {
    webhookSubscriptions(first: 10, topics: $topics) {
      nodes {
        topic
      }
    }
  }
`;

export type WebhookHealth = {
  healthy: boolean;
  registeredTopics: string[];
  missingTopics: string[];
};

export async function checkWebhookHealth(): Promise<WebhookHealth> {
  await requireAdmin();
  const data = await shopifyAdminRequest<any>(LIST_QUERY, { topics: EXPECTED_TOPICS });
  const registeredTopics: string[] = [...new Set(data.webhookSubscriptions.nodes.map((n: any) => n.topic))] as string[];
  const missingTopics = EXPECTED_TOPICS.filter((t) => !registeredTopics.includes(t));
  return { healthy: missingTopics.length === 0, registeredTopics, missingTopics };
}
