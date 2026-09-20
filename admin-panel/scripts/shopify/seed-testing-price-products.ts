/**
 * Testing script -- creates 2 Product Lines specifically to test the wholesale/retail price split
 * end-to-end at checkout (paired with scripts/supabase/seed-testing-price-test-customers.ts).
 * Follows the real `createProductLine`/variant architecture exactly (src/data/products.ts,
 * src/data/variants.ts): one Shopify Product PER REGION (productType = Sub-category name, vendor =
 * Brand name, `region-<value>` tag), each with 2 Flavour variants. Every variant in a product gets
 * the SAME wholesale price (Shopify's native `price`), retail price (`custom.retail_price`
 * metafield, money-typed, drives createDraftOrder's retail override), and compareAtPrice --
 * confirms price behaviour doesn't accidentally vary by flavour or region within one product line.
 *
 * Price plan (as specified):
 *   Product A (RAW / Rolling Papers): wholesale $10.00, retail $9.00, compareAt $5.00
 *   Product B (Elf Bar / Disposable Vapes): wholesale $8.00, retail $7.00, compareAt $5.00
 * All 6 regions (federal, bc, alberta, manitoba, ontario, quebec), 2 flavours per region-product.
 *
 * Not idempotent (no name-based lookup) -- safe to run once; re-running creates duplicates.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/seed-testing-price-products.ts
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const RAW_BRAND_ID = 'gid://shopify/Metaobject/252081078470';
const ELF_BAR_BRAND_ID = 'gid://shopify/Metaobject/252080029894';

const REGIONS = [
  { value: 'federal', label: 'Federal' },
  { value: 'bc', label: 'BC' },
  { value: 'alberta', label: 'Alberta' },
  { value: 'manitoba', label: 'Manitoba' },
  { value: 'ontario', label: 'Ontario' },
  { value: 'quebec', label: 'Quebec' },
];

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
      productVariants { id title }
      userErrors { field message }
    }
  }
`;
const GET_ONLINE_STORE_PUBLICATION_QUERY = /* GraphQL */ `
  query GetOnlineStorePublication {
    publications(first: 10) { nodes { id name } }
  }
`;
const PUBLISHABLE_PUBLISH_MUTATION = /* GraphQL */ `
  mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
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

interface PricePlan {
  wholesale: string;
  retail: string;
  compareAt: string;
}

async function createRegionProduct(
  baseTitle: string,
  brandId: string,
  productType: string,
  vendor: string,
  region: { value: string; label: string },
  flavours: string[],
  price: PricePlan,
  publicationId: string
) {
  const currencyCode = await getShopCurrency();
  const title = `${baseTitle} — ${region.label}`;

  const productData = await shopifyAdminRequest<any>(PRODUCT_CREATE_MUTATION, {
    product: {
      title,
      productType,
      vendor,
      tags: [`region-${region.value}`],
      descriptionHtml: `<p>Test product for the wholesale/retail pricing flow -- ${baseTitle}, ${region.label}. Placeholder copy, not real product content.</p>`,
      productOptions: [{ name: 'Flavor', values: [{ name: 'Default' }] }],
      metafields: [
        { namespace: 'taxonomy', key: 'brand', type: 'metaobject_reference', value: brandId },
        { namespace: 'custom', key: 'region', type: 'single_line_text_field', value: region.value },
      ],
    },
  });
  assertNoUserErrors(productData.productCreate.userErrors, `productCreate(${title})`);
  const productId = productData.productCreate.product.id as string;
  console.log(`  created: ${title} -> ${productId}`);

  const variants = flavours.map((flavourName) => ({
    optionValues: [{ name: flavourName, optionName: 'Flavor' }],
    price: price.wholesale,
    compareAtPrice: price.compareAt,
    metafields: [
      {
        namespace: 'custom',
        key: 'retail_price',
        type: 'money',
        value: JSON.stringify({ amount: price.retail, currency_code: currencyCode }),
      },
    ],
  }));
  const variantData = await shopifyAdminRequest<any>(BULK_VARIANT_CREATE_MUTATION, { productId, variants });
  assertNoUserErrors(variantData.productVariantsBulkCreate.userErrors, `productVariantsBulkCreate(${title})`);
  console.log(`    created ${variantData.productVariantsBulkCreate.productVariants.length} flavours (wholesale $${price.wholesale} / retail $${price.retail} / compareAt $${price.compareAt})`);

  const publishData = await shopifyAdminRequest<any>(PUBLISHABLE_PUBLISH_MUTATION, {
    id: productId,
    input: [{ publicationId }],
  });
  assertNoUserErrors(publishData.publishablePublish.userErrors, `publishablePublish(${title})`);
  console.log(`    published to Online Store`);

  return productId;
}

async function main() {
  console.log('Seeding price-test Product Lines (wholesale/retail/compareAt split, all regions)...');
  const publicationId = await getOnlineStorePublicationId();

  console.log('\nProduct A: Price Test — RAW Rolling Papers (wholesale $10 / retail $9 / compareAt $5)');
  for (const region of REGIONS) {
    await createRegionProduct(
      'Price Test — RAW Rolling Papers',
      RAW_BRAND_ID,
      'Rolling Papers',
      'RAW',
      region,
      ['Flavour 1', 'Flavour 2'],
      { wholesale: '10.00', retail: '9.00', compareAt: '5.00' },
      publicationId
    );
  }

  console.log('\nProduct B: Price Test — Elf Bar Disposable Vape (wholesale $8 / retail $7 / compareAt $5)');
  for (const region of REGIONS) {
    await createRegionProduct(
      'Price Test — Elf Bar Disposable Vape',
      ELF_BAR_BRAND_ID,
      'Disposable Vapes',
      'Elf Bar',
      region,
      ['Flavour 1', 'Flavour 2'],
      { wholesale: '8.00', retail: '7.00', compareAt: '5.00' },
      publicationId
    );
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
