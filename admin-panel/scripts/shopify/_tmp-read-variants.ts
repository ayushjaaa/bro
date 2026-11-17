import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
// Read-only: print a product's variants (option, SKU, previous_sku, price, stock).
shopifyAdminRequest<any>(`query($h:String!){productByHandle(handle:$h){status variants(first:50){nodes{sku price inventoryQuantity selectedOptions{value} prev:metafield(namespace:"custom",key:"previous_sku"){value}}}}}`, { h: process.argv[2] })
  .then((d) => { console.log(d.productByHandle.status); d.productByHandle.variants.nodes.forEach((v: any) => console.log(' ', v.selectedOptions[0]?.value, '|', v.sku, '| prev', v.prev?.value, '|', v.price, '|', v.inventoryQuantity)); })
  .catch((e) => { console.error(e); process.exit(1); });
