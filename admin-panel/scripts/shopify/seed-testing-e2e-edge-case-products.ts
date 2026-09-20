/**
 * Testing script -- creates 2 dedicated edge-case Product Lines for the E2E pricing/inventory/
 * checkout suite (storefront/e2e/pricing-inventory-checkout.spec.ts):
 *
 *   - "Price Test — Out Of Stock — Federal": 0 units, for testing that an exhausted variant
 *     disables Add to Cart on the PDP and is excluded/flagged at checkout.
 *   - "Price Test — Low Stock — Federal": 2 units, for testing that adding MORE than available
 *     stock is rejected by Shopify's own DENY inventory policy, and that completing an order
 *     against it (not covered by this script -- see PRODUCTION_MIGRATION_PENDING.md's note on
 *     draftOrderCreate not touching inventory) is the only thing that actually decrements stock.
 *
 * Same per-region-product architecture as seed-testing-price-products.ts (productType =
 * Sub-category name, vendor = Brand name, `region-<value>` tag) -- Federal only, these don't need
 * the full 6-region spread other price-test products have.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/seed-testing-e2e-edge-case-products.ts
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

async function seedEdgeCaseProduct(title: string, stockQuantity: number, publicationId: string) {
  const currencyCode = await getShopCurrency();

  const productData = await shopifyAdminRequest<any>(PRODUCT_CREATE_MUTATION, {
    product: {
      title,
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
  assertNoUserErrors(productData.productCreate.userErrors, `productCreate(${title})`);
  const productId = productData.productCreate.product.id as string;
  console.log(`created: ${title} -> ${productId}`);

  const variantData = await shopifyAdminRequest<any>(BULK_VARIANT_CREATE_MUTATION, {
    productId,
    variants: [
      {
        optionValues: [{ name: 'Flavour 1', optionName: 'Flavor' }],
        price: '10.00',
        metafields: [
          {
            namespace: 'custom',
            key: 'retail_price',
            type: 'money',
            value: JSON.stringify({ amount: '9.00', currency_code: currencyCode }),
          },
        ],
      },
    ],
  });
  assertNoUserErrors(variantData.productVariantsBulkCreate.userErrors, `productVariantsBulkCreate(${title})`);
  const variant = variantData.productVariantsBulkCreate.productVariants[0];
  console.log(`  created variant -> ${variant.id}`);

  const setQtyData = await shopifyAdminRequest<any>(SET_QUANTITIES_MUTATION, {
    input: {
      name: 'available',
      reason: 'correction',
      quantities: [
        {
          inventoryItemId: variant.inventoryItem.id,
          locationId: INVENTORY_LOCATION_ID,
          quantity: stockQuantity,
          changeFromQuantity: 0,
        },
      ],
    },
    key: `e2e-edge-case-stock-${Date.now()}-${Math.random()}`,
  });
  assertNoUserErrors(setQtyData.inventorySetQuantities.userErrors, `inventorySetQuantities(${title})`);
  console.log(`  stock set to ${stockQuantity}`);

  const publishData = await shopifyAdminRequest<any>(PUBLISHABLE_PUBLISH_MUTATION, {
    id: productId,
    input: [{ publicationId }],
  });
  assertNoUserErrors(publishData.publishablePublish.userErrors, `publishablePublish(${title})`);
  console.log(`  published to Online Store`);

  return { productId, variantId: variant.id as string };
}

async function main() {
  console.log('Seeding E2E edge-case products (out-of-stock, low-stock)...\n');
  const publicationId = await getOnlineStorePublicationId();

  const outOfStock = await seedEdgeCaseProduct('Price Test — Out Of Stock — Federal', 0, publicationId);
  console.log();
  const lowStock = await seedEdgeCaseProduct('Price Test — Low Stock — Federal', 2, publicationId);

  console.log('\nDone.');
  console.log('Out of stock:', outOfStock);
  console.log('Low stock:', lowStock);
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
