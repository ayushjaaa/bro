/**
 * Re-seeds a small set of REAL demo Product Lines + Flavours -- Shopify ended up with 0 products
 * after this session's testing (all test products were cleaned up, including a couple that were
 * real, not test, data). Not idempotent by name-check the way the taxonomy seed is (products
 * aren't looked up by title here) -- safe to run once; re-running would create duplicates.
 *
 * Run: npm run shopify:seed-sample-products
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const RAW_BRAND_ID = 'gid://shopify/Metaobject/214438084920';
const ELF_BAR_BRAND_ID = 'gid://shopify/Metaobject/214436970808';

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

async function createProduct(title: string, brandId: string, customFields: Record<string, string>) {
  const metafields = [
    { namespace: 'taxonomy', key: 'brand', type: 'metaobject_reference', value: brandId },
    ...Object.entries(customFields).map(([key, value]) => ({
      namespace: 'custom',
      key,
      type: 'single_line_text_field',
      value,
    })),
  ];
  const data = await shopifyAdminRequest<any>(PRODUCT_CREATE_MUTATION, {
    product: {
      title,
      productOptions: [{ name: 'Flavor', values: [{ name: 'Default' }] }],
      metafields,
    },
  });
  assertNoUserErrors(data.productCreate.userErrors, `productCreate(${title})`);
  console.log(`created product: ${title} -> ${data.productCreate.product.id}`);
  return data.productCreate.product.id as string;
}

async function createVariants(
  productId: string,
  flavours: Array<{ name: string; price: string; region: string; description: string }>
) {
  const variants = flavours.map((f) => ({
    optionValues: [{ name: `${f.name} (${f.region})`, optionName: 'Flavor' }],
    price: f.price,
    metafields: [
      { namespace: 'custom', key: 'region', type: 'single_line_text_field', value: f.region },
      {
        namespace: 'custom',
        key: 'flavour_description',
        type: 'multi_line_text_field',
        value: f.description,
      },
    ],
  }));
  const data = await shopifyAdminRequest<any>(BULK_VARIANT_CREATE_MUTATION, { productId, variants });
  assertNoUserErrors(data.productVariantsBulkCreate.userErrors, `productVariantsBulkCreate(${productId})`);
  console.log(`  created ${data.productVariantsBulkCreate.productVariants.length} flavours`);
}

async function main() {
  console.log('Seeding sample Product Lines + Flavours...\n');

  const rawProductId = await createProduct('RAW Classic Rolling Papers – King Size', RAW_BRAND_ID, {
    rolling_paper_paper_size: 'King Size',
    rolling_paper_material: 'Hemp',
  });
  await createVariants(rawProductId, [
    { name: 'Original', price: '5.99', region: 'federal', description: 'Classic slow-burning hemp paper.' },
    { name: 'Original', price: '5.99', region: 'bc', description: 'Classic slow-burning hemp paper.' },
    { name: 'Original', price: '5.99', region: 'alberta', description: 'Classic slow-burning hemp paper.' },
    { name: 'Original', price: '5.99', region: 'manitoba', description: 'Classic slow-burning hemp paper.' },
    { name: 'Original', price: '5.99', region: 'ontario', description: 'Classic slow-burning hemp paper.' },
    { name: 'Original', price: '5.99', region: 'quebec', description: 'Classic slow-burning hemp paper.' },
  ]);

  console.log();
  const elfBarProductId = await createProduct('Elf Bar BC10000 Disposable Vape', ELF_BAR_BRAND_ID, {
    disposable_vape_puff_count: '10000',
    disposable_vape_nicotine_strength: '20mg',
    disposable_vape_device_type: 'Standard Disposable',
  });
  await createVariants(elfBarProductId, [
    { name: 'Blue Razz Ice', price: '24.99', region: 'federal', description: 'Blue raspberry with a cold menthol finish.' },
    { name: 'Blue Razz Ice', price: '24.99', region: 'ontario', description: 'Blue raspberry with a cold menthol finish.' },
    { name: 'Watermelon Ice', price: '24.99', region: 'federal', description: 'Sweet watermelon with a cold menthol finish.' },
    { name: 'Watermelon Ice', price: '24.99', region: 'ontario', description: 'Sweet watermelon with a cold menthol finish.' },
  ]);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
