/**
 * Testing script -- creates ONE dedicated product for the stock-flow E2E test
 * (storefront/e2e/stock-flow.spec.ts): "Price Test — Stock Flow — Federal", a single variant
 * "Flavour 1", available = 4. Kept separate from every other test product so no old order can hold
 * its stock. Idempotent: if the product already exists it is left alone (no duplicate).
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/seed-testing-stock-flow-product.ts
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const RAW_BRAND_ID = 'gid://shopify/Metaobject/252081078470';
const INVENTORY_LOCATION_ID = 'gid://shopify/Location/84994621638';

const PRODUCT_CREATE_MUTATION = /* GraphQL */ `
  mutation ProductCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product { id title }
      userErrors { field message }
    }
  }
`;
const BULK_VARIANT_CREATE_MUTATION = /* GraphQL */ `
  mutation BulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(
      productId: $productId
      variants: $variants
      strategy: REMOVE_STANDALONE_VARIANT
    ) {
      productVariants { id inventoryItem { id } }
      userErrors { field message }
    }
  }
`;
const GET_ONLINE_STORE_PUBLICATION_QUERY = /* GraphQL */ `
  query { publications(first: 10) { nodes { id name } } }
`;
const PUBLISHABLE_PUBLISH_MUTATION = /* GraphQL */ `
  mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) { userErrors { field message } }
  }
`;
const SET_QUANTITIES_MUTATION = /* GraphQL */ `
  mutation SetQuantities($input: InventorySetQuantitiesInput!, $key: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $key) {
      userErrors { field message }
    }
  }
`;

let cachedShopCurrency: string | null = null;
async function getShopCurrency(): Promise<string> {
  if (cachedShopCurrency) return cachedShopCurrency;
  const data = await shopifyAdminRequest<{ shop: { currencyCode: string } }>('{ shop { currencyCode } }');
  cachedShopCurrency = data.shop.currencyCode;
  return cachedShopCurrency;
}

async function getOnlineStorePublicationId(): Promise<string> {
  const data = await shopifyAdminRequest<any>(GET_ONLINE_STORE_PUBLICATION_QUERY);
  const publication = data.publications.nodes.find((p: any) => p.name === 'Online Store');
  if (!publication) throw new Error('"Online Store" publication not found for this store');
  return publication.id;
}


const TITLE = 'Price Test — Stock Flow — Federal';
const HANDLE = 'price-test-stock-flow-federal';

async function main() {
  const existing = await shopifyAdminRequest<any>(
    `query($h: String!) { productByHandle(handle: $h) { id variants(first: 1) { nodes { id } } } }`,
    { h: HANDLE }
  );
  if (existing.productByHandle) {
    console.log('already exists, nothing to do:', existing.productByHandle.id, existing.productByHandle.variants.nodes[0]?.id);
    return;
  }
  const publicationId = await getOnlineStorePublicationId();
  const currencyCode = await getShopCurrency();

  const productData = await shopifyAdminRequest<any>(PRODUCT_CREATE_MUTATION, {
    product: {
      title: TITLE,
      productType: 'Rolling Papers',
      vendor: 'RAW',
      tags: ['region-federal'],
      productOptions: [{ name: 'Flavor', values: [{ name: 'Default' }] }],
      metafields: [
        { namespace: 'taxonomy', key: 'brand', type: 'metaobject_reference', value: RAW_BRAND_ID },
        { namespace: 'custom', key: 'region', type: 'single_line_text_field', value: 'federal' },
      ],
    },
  });
  assertNoUserErrors(productData.productCreate.userErrors, 'productCreate');
  const productId = productData.productCreate.product.id as string;

  const variantData = await shopifyAdminRequest<any>(BULK_VARIANT_CREATE_MUTATION, {
    productId,
    variants: [{
      optionValues: [{ name: 'Flavour 1', optionName: 'Flavor' }],
      price: '10.00',
      metafields: [{ namespace: 'custom', key: 'retail_price', type: 'money', value: JSON.stringify({ amount: '9.00', currency_code: currencyCode }) }],
    }],
  });
  assertNoUserErrors(variantData.productVariantsBulkCreate.userErrors, 'productVariantsBulkCreate');
  const variant = variantData.productVariantsBulkCreate.productVariants[0];

  const setQty = await shopifyAdminRequest<any>(SET_QUANTITIES_MUTATION, {
    input: { name: 'available', reason: 'correction', quantities: [{ inventoryItemId: variant.inventoryItem.id, locationId: INVENTORY_LOCATION_ID, quantity: 4, changeFromQuantity: 0 }] },
    key: `stock-flow-seed-${Date.now()}`,
  });
  assertNoUserErrors(setQty.inventorySetQuantities.userErrors, 'inventorySetQuantities');

  const publish = await shopifyAdminRequest<any>(PUBLISHABLE_PUBLISH_MUTATION, { id: productId, input: [{ publicationId }] });
  assertNoUserErrors(publish.publishablePublish.userErrors, 'publishablePublish');
  console.log('created:', TITLE, productId, variant.id, '(stock 4, published to Online Store)');
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
