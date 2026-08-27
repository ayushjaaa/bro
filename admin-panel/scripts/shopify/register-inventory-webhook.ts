/**
 * One-time (or re-run-when-URL-changes) setup script -- registers Shopify's
 * INVENTORY_LEVELS_UPDATE webhook to point at this app's webhook route.
 *
 * The callback URL is NOT hardcoded: it's swappable via WEBHOOK_CALLBACK_BASE_URL, since the
 * local dev flow uses a temporary ngrok tunnel URL, and this must be re-run with the real
 * production domain once this app is deployed publicly.
 *
 * Run: WEBHOOK_CALLBACK_BASE_URL=https://<ngrok-subdomain>.ngrok-free.app npm run shopify:register-inventory-webhook
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

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
  query ListInventoryWebhooks {
    webhookSubscriptions(first: 10, topics: [INVENTORY_LEVELS_UPDATE]) {
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
  const callbackUrl = `${baseUrl.replace(/\/$/, '')}/api/webhooks/inventory`;

  const existing = await shopifyAdminRequest<any>(LIST_EXISTING_QUERY);
  const existingNodes = existing.webhookSubscriptions.nodes;
  if (existingNodes.length > 0) {
    console.log('Existing INVENTORY_LEVELS_UPDATE subscriptions found:');
    for (const n of existingNodes) console.log(`  ${n.id} -> ${n.callbackUrl}`);
    console.log(
      'Delete stale ones (npm run shopify:unregister-inventory-webhook -- <id>) before registering a new URL, to avoid duplicate deliveries.'
    );
  }

  const data = await shopifyAdminRequest<any>(CREATE_WEBHOOK_MUTATION, {
    topic: 'INVENTORY_LEVELS_UPDATE',
    webhookSubscription: {
      callbackUrl,
      format: 'JSON',
    },
  });
  assertNoUserErrors(data.webhookSubscriptionCreate.userErrors, 'webhookSubscriptionCreate');
  console.log('Registered:', data.webhookSubscriptionCreate.webhookSubscription);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
