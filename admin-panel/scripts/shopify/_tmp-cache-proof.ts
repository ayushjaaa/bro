import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

async function main() {
  const data = await shopifyAdminRequest<any>(
    `mutation { productUpdate(product: { id: "gid://shopify/Product/10859117707576", title: "Drip'n Test Line — CACHE PROOF" }) { product { id title } userErrors { field message } } }`
  );
  assertNoUserErrors(data.productUpdate.userErrors, 'productUpdate');
  console.log('Updated:', data.productUpdate.product);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
