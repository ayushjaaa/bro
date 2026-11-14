/**
 * One-time (or re-run-when-URL-changes) setup script -- registers every order/draft-order topic
 * the orders webhook route handles (see TOPICS) to point at that route (the Order-Request-Submitted
 * / Order-Confirmed funnel stages and the per-customer order log). Safe to re-run: a topic already
 * subscribed to this exact URL is skipped, so adding a new topic later only creates that one.
 *
 * Run: WEBHOOK_CALLBACK_BASE_URL=https://<ngrok-subdomain>.ngrok-free.app npm run shopify:register-orders-webhook
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const TOPICS = [
  'DRAFT_ORDERS_CREATE',
  'DRAFT_ORDERS_UPDATE',
  'DRAFT_ORDERS_DELETE',
  'ORDERS_CREATE',
  'ORDERS_UPDATED',
  'ORDERS_CANCELLED',
  'ORDERS_FULFILLED',
  'ORDERS_PARTIALLY_FULFILLED',
];

const CREATE_WEBHOOK_MUTATION = /* GraphQL */ `
  mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription {
        id
        uri
        topic
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const LIST_EXISTING_QUERY = /* GraphQL */ `
  query ListOrdersWebhooks($topics: [WebhookSubscriptionTopic!]) {
    webhookSubscriptions(first: 50, topics: $topics) {
      nodes {
        id
        uri
        topic
      }
    }
  }
`;

async function main() {
  const baseUrl = process.env.WEBHOOK_CALLBACK_BASE_URL;
  if (!baseUrl) {
    throw new Error('Set WEBHOOK_CALLBACK_BASE_URL (e.g. your ngrok URL) before running this script.');
  }
  const callbackUrl = `${baseUrl.replace(/\/$/, '')}/api/webhooks/orders`;

  const existing = await shopifyAdminRequest<any>(LIST_EXISTING_QUERY, { topics: TOPICS });
  const existingNodes = existing.webhookSubscriptions.nodes;
  if (existingNodes.length > 0) {
    console.log('Existing orders-topic subscriptions found:');
    for (const n of existingNodes) console.log(`  ${n.topic}: ${n.id} -> ${n.uri}`);
    console.log(
      'Delete stale ones (npm run shopify:unregister-orders-webhook -- <id>) before registering a new URL, to avoid duplicate deliveries.'
    );
  }

  for (const topic of TOPICS) {
    if (existingNodes.some((n: any) => n.topic === topic && n.uri === callbackUrl)) {
      console.log(`Already registered, skipping: ${topic} -> ${callbackUrl}`);
      continue;
    }
    const data = await shopifyAdminRequest<any>(CREATE_WEBHOOK_MUTATION, {
      topic,
      webhookSubscription: { uri: callbackUrl, format: 'JSON' },
    });
    assertNoUserErrors(data.webhookSubscriptionCreate.userErrors, `webhookSubscriptionCreate(${topic})`);
    console.log('Registered:', data.webhookSubscriptionCreate.webhookSubscription);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
