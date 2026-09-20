import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

async function main() {
  const data = await shopifyAdminRequest<any>('{ shop { currencyCode } }');
  console.log(JSON.stringify(data, null, 2));
}
main();
