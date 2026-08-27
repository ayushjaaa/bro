/**
 * Deletes a products-topic webhook subscription by id -- for cleaning up after ngrok test
 * sessions (a stale registration pointed at a closed tunnel URL would otherwise just sit there
 * failing until Shopify auto-deletes it after enough consecutive failures).
 *
 * Run: npm run shopify:unregister-products-webhook -- gid://shopify/WebhookSubscription/12345
 * (omit the id to list current product-topic subscriptions instead of deleting)
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const TOPICS = ['PRODUCTS_CREATE', 'PRODUCTS_UPDATE', 'PRODUCTS_DELETE'];

const LIST_QUERY = /* GraphQL */ `
  query ListProductWebhooks($topics: [WebhookSubscriptionTopic!]) {
    webhookSubscriptions(first: 10, topics: $topics) {
      nodes {
        id
        callbackUrl
        topic
      }
    }
  }
`;

const DELETE_MUTATION = /* GraphQL */ `
  mutation DeleteWebhook($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors {
        field
        message
      }
    }
  }
`;

async function main() {
  const id = process.argv[2];

  if (!id) {
    const data = await shopifyAdminRequest<any>(LIST_QUERY, { topics: TOPICS });
    const nodes = data.webhookSubscriptions.nodes;
    if (nodes.length === 0) {
      console.log('No product-topic subscriptions found.');
      return;
    }
    console.log('Current product-topic subscriptions:');
    for (const n of nodes) console.log(`  ${n.topic}: ${n.id} -> ${n.callbackUrl}`);
    console.log('\nRe-run with an id to delete it: npm run shopify:unregister-products-webhook -- <id>');
    return;
  }

  const data = await shopifyAdminRequest<any>(DELETE_MUTATION, { id });
  assertNoUserErrors(data.webhookSubscriptionDelete.userErrors, 'webhookSubscriptionDelete');
  console.log('Deleted:', data.webhookSubscriptionDelete.deletedWebhookSubscriptionId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
