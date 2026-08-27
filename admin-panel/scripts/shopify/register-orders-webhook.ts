/**
 * One-time (or re-run-when-URL-changes) setup script -- registers Shopify's DRAFT_ORDERS_CREATE,
 * DRAFT_ORDERS_UPDATE, ORDERS_CREATE, and ORDERS_UPDATED webhooks to point at this app's orders
 * webhook route (the Order-Request-Submitted / Order-Confirmed funnel stages).
 *
 * Run: WEBHOOK_CALLBACK_BASE_URL=https://<ngrok-subdomain>.ngrok-free.app npm run shopify:register-orders-webhook
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const TOPICS = ['DRAFT_ORDERS_CREATE', 'DRAFT_ORDERS_UPDATE', 'ORDERS_CREATE', 'ORDERS_UPDATED'];

const CREATE_WEBHOOK_MUTATION = /* GraphQL */ `
  mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription {
        id
        callbackUrl
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
    webhookSubscriptions(first: 10, topics: $topics) {
      nodes {
        id
        callbackUrl
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
    for (const n of existingNodes) console.log(`  ${n.topic}: ${n.id} -> ${n.callbackUrl}`);
    console.log(
      'Delete stale ones (npm run shopify:unregister-orders-webhook -- <id>) before registering a new URL, to avoid duplicate deliveries.'
    );
  }

  for (const topic of TOPICS) {
    const data = await shopifyAdminRequest<any>(CREATE_WEBHOOK_MUTATION, {
      topic,
      webhookSubscription: { callbackUrl, format: 'JSON' },
    });
    assertNoUserErrors(data.webhookSubscriptionCreate.userErrors, `webhookSubscriptionCreate(${topic})`);
    console.log('Registered:', data.webhookSubscriptionCreate.webhookSubscription);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
