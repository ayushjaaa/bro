import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
// Read-only: list webhook subscriptions and their target URLs.
shopifyAdminRequest<any>(`{ webhookSubscriptions(first: 50) { nodes { topic uri } } }`)
  .then((d) => d.webhookSubscriptions.nodes.forEach((n: any) => console.log(n.topic, '->', n.uri)))
  .catch((e) => { console.error(e); process.exit(1); });
