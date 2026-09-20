/**
 * Re-seeds a small set of REAL demo Product Lines + Flavours, matching the real
 * `createProductLine`/`publishProductLine` architecture (src/data/products.ts, PRODUCT_PAGE_PLAN.md
 * §11.3): one Shopify Product **per region** (not one product with mixed-region variants),
 * `productType` = Sub-category name, `vendor` = Brand name, `region-<value>` tag -- these are what
 * the storefront's native `products(query: "product_type:... AND vendor:... AND tag:...")` search
 * actually filters on. Each region-clone is then explicitly published to the "Online Store"
 * channel -- `productCreate` alone sets status ACTIVE but never makes a product visible to
 * customers on its own.
 *
 * Not idempotent by name-check the way the taxonomy seed is (products aren't looked up by title
 * here) -- safe to run once; re-running would create duplicates.
 *
 * Run: npm run shopify:seed-testing-products
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const RAW_BRAND_ID = 'gid://shopify/Metaobject/252081078470';
const ELF_BAR_BRAND_ID = 'gid://shopify/Metaobject/252080029894';

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
    publications(first: 10) {
      nodes { id name }
    }
  }
`;

const PUBLISHABLE_PUBLISH_MUTATION = /* GraphQL */ `
  mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

async function getOnlineStorePublicationId(): Promise<string> {
  const data = await shopifyAdminRequest<any>(GET_ONLINE_STORE_PUBLICATION_QUERY);
  const publication = data.publications.nodes.find((p: any) => p.name === 'Online Store');
  if (!publication) throw new Error('"Online Store" publication not found for this store');
  return publication.id;
}

async function createProduct(
  title: string,
  brandId: string,
  productType: string,
  vendor: string,
  region: string,
  customFields: Record<string, string>
) {
  const metafields = [
    { namespace: 'taxonomy', key: 'brand', type: 'metaobject_reference', value: brandId },
    { namespace: 'custom', key: 'region', type: 'single_line_text_field', value: region },
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
      productType,
      vendor,
      tags: [`region-${region}`],
      productOptions: [{ name: 'Flavor', values: [{ name: 'Default' }] }],
      metafields,
    },
  });
  assertNoUserErrors(data.productCreate.userErrors, `productCreate(${title})`);
  console.log(`  created product: ${title} -> ${data.productCreate.product.id}`);
  return data.productCreate.product.id as string;
}

async function createVariants(
  productId: string,
  flavours: Array<{ name: string; price: string; description: string }>
) {
  const variants = flavours.map((f) => ({
    optionValues: [{ name: f.name, optionName: 'Flavor' }],
    price: f.price,
    metafields: [
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
  console.log(`    created ${data.productVariantsBulkCreate.productVariants.length} flavours`);
}

async function publish(productId: string, publicationId: string) {
  const data = await shopifyAdminRequest<any>(PUBLISHABLE_PUBLISH_MUTATION, {
    id: productId,
    input: [{ publicationId }],
  });
  assertNoUserErrors(data.publishablePublish.userErrors, `publishablePublish(${productId})`);
  console.log(`    published to Online Store`);
}

async function seedProductLine(
  baseTitle: string,
  brandId: string,
  productType: string,
  vendor: string,
  customFields: Record<string, string>,
  regions: Array<{ value: string; label: string; flavours: Array<{ name: string; price: string; description: string }> }>,
  publicationId: string
) {
  console.log(`\n${baseTitle}:`);
  for (const region of regions) {
    const title = `${baseTitle} — ${region.label}`;
    const productId = await createProduct(title, brandId, productType, vendor, region.value, customFields);
    await createVariants(productId, region.flavours);
    await publish(productId, publicationId);
  }
}

async function main() {
  console.log('Seeding sample Product Lines + Flavours (one Product per region, matching the real createProductLine architecture)...');

  const publicationId = await getOnlineStorePublicationId();

  const rawFlavours = [{ name: 'Original', price: '5.99', description: 'Classic slow-burning hemp paper.' }];
  await seedProductLine(
    'RAW Classic Rolling Papers – King Size',
    RAW_BRAND_ID,
    'Rolling Papers',
    'RAW',
    { rolling_paper_paper_size: 'King Size', rolling_paper_material: 'Hemp' },
    [
      { value: 'federal', label: 'Federal', flavours: rawFlavours },
      { value: 'bc', label: 'BC', flavours: rawFlavours },
      { value: 'alberta', label: 'Alberta', flavours: rawFlavours },
      { value: 'manitoba', label: 'Manitoba', flavours: rawFlavours },
      { value: 'ontario', label: 'Ontario', flavours: rawFlavours },
      { value: 'quebec', label: 'Quebec', flavours: rawFlavours },
    ],
    publicationId
  );

  const elfBarFlavours = [
    { name: 'Blue Razz Ice', price: '24.99', description: 'Blue raspberry with a cold menthol finish.' },
    { name: 'Watermelon Ice', price: '24.99', description: 'Sweet watermelon with a cold menthol finish.' },
  ];
  await seedProductLine(
    'Elf Bar BC10000 Disposable Vape',
    ELF_BAR_BRAND_ID,
    'Disposable Vapes',
    'Elf Bar',
    { disposable_vape_puff_count: '10000', disposable_vape_nicotine_strength: '20mg', disposable_vape_device_type: 'Standard Disposable' },
    [
      { value: 'federal', label: 'Federal', flavours: elfBarFlavours },
      { value: 'ontario', label: 'Ontario', flavours: elfBarFlavours },
    ],
    publicationId
  );

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
