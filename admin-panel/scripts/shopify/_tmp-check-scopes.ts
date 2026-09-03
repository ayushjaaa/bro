import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const QUERY = `query { app { installation { accessScopes { handle } } } }`;
shopifyAdminRequest<any>(QUERY)
  .then((d) => console.log(JSON.stringify(d, null, 2)))
  .catch((e) => console.error('ERR', e.message, JSON.stringify(e.errors, null, 2)));
