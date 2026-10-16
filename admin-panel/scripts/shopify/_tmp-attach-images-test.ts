import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const M = /* GraphQL */ `mutation($productId: ID!, $media: [CreateMediaInput!]!) {
  productCreateMedia(productId: $productId, media: $media) {
    media { id status }
    mediaUserErrors { field message }
  }
}`;
async function main() {
  const res = await shopifyAdminRequest<any>(M, {
    productId: 'gid://shopify/Product/9093229609158',
    media: [{ originalSource: 'https://cdn.shopify.com/s/files/1/0856/7016/6840/files/converted-45137233903928.avif?v=1787594279', mediaContentType: 'IMAGE' }],
  });
  console.log(JSON.stringify(res, null, 2));
}
main().catch(e=>{console.error(e);process.exit(1)});
