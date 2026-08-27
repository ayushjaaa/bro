/**
 * Deletes an orders-topic webhook subscription by id -- for cleaning up after ngrok test sessions.
 *
 * Run: npm run shopify:unregister-orders-webhook -- gid://shopify/WebhookSubscription/12345
 * (omit the id to list current orders-topic subscriptions instead of deleting)
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const TOPICS = ['DRAFT_ORDERS_CREATE', 'DRAFT_ORDERS_UPDATE', 'ORDERS_CREATE', 'ORDERS_UPDATED'];

const LIST_QUERY = /* GraphQL */ `
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
      console.log('No orders-topic subscriptions found.');
      return;
    }
    console.log('Current orders-topic subscriptions:');
    for (const n of nodes) console.log(`  ${n.topic}: ${n.id} -> ${n.callbackUrl}`);
    console.log('\nRe-run with an id to delete it: npm run shopify:unregister-orders-webhook -- <id>');
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
