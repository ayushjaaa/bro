import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

async function main() {
  const data = await shopifyAdminRequest<any>(`
    query {
      __type(name: "MetafieldCapabilitySmartCollectionConditionInput") {
        inputFields { name type { name kind ofType { name kind } } }
      }
    }
  `);
  console.log(JSON.stringify(data.__type.inputFields, null, 2));
}

main();
