/**
 * One-off script: creates a real "Gcore E-Juices 20mg/30ml - Federal" Product Line with every
 * real flavour the user provided, each variant getting its OWN distinct generated image (so the
 * user can visually verify per-variant images actually differ) — for testing the storefront's
 * upcoming real Shopify product-page + Storefront API wiring.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-create-gcore-product.ts
 */
import sharp from 'sharp';
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const INVENTORY_LOCATION_ID = 'gid://shopify/Location/115762495800';
const TITLE = 'Gcore E-Juices 20mg/30ml - Federal';
const BRAND_NAME = 'Gcore';
const SUB_CATEGORY_NAME = 'E-Liquids / Vape Juice';
const REGION = 'federal';
const PRICE = '16.83';
const QUANTITY = 50;

const FLAVOURS = [
  'Apple Cherry', 'Apple Kiwi', 'Apple Mango', 'Apple Pear', 'Apple Strawberry Watermelon',
  'Arctic Berries', 'B.g', 'B.t.', 'Bahama Mama', 'Banana Ice', 'Blackberry Ice',
  'Blue Raspberry Pomegranate', 'Blue Razz', 'Banana Berries Ice', 'Banana Mango',
  'Banana Raspberry', 'Belly Jelly Sweets', 'Blackberry Banana', 'Blood Orange',
  'Blue Razz Blackberry', 'Blue Razz Cherry Lemon Ice', 'Blue Razz Grape Lemon Ice',
  'Blue Razz Ice Twist', 'Blue Razz Peach Ice', 'Blueberry B.g. Ice', 'Blueberry Cherry Ice',
  'Blueberry Ice', 'Blueberry Lemon Ice', 'Blueberry Tobacco', 'C.crush', 'Classico Ice',
  'Chobacco', 'Citrus Blast', 'Classic Dp.', 'Classic Grape Ice', 'Classic Ice Twist',
  'Classic Route F', 'Classico Cherry Ice', 'Classico Lime', 'Classico Vanilla',
  'Coffee Tobacco', 'Cool Mint', 'Double Mint', 'Doc.pep', 'Dragon Fruit Lychee',
  'Epic Fruit Bomb', 'Epic Spearmint', 'Frozen Grape', 'Frozen Pineapple', 'Frozen Strawberry',
  'Fruit.p', 'Guava Ice', 'Grape Cherry Ice', 'Grape Passion Fruit', 'Grape Peach Cherry',
  'Grape Raspberry Ice', 'Grape Tobacco', 'Grape Watermelon', 'Gusto Green Apple',
  'Hawaiian Red', 'Honeydew Cantaloupe', 'Honeydew Pineapple', 'Hyper E', 'J.f.',
  'Killer Lady', 'Kiwi Raspberry Mint', 'Lychee Ice', 'Mangorita', 'Md', 'Mint',
  'Mad Mango Peach', 'Mango Berries Ice', 'Mango Ice', 'Mountain Citrus', 'Orange Fizz',
  'Peach Berry', 'Peach Ice', 'Peach Raspberry Ice', 'Peppermint Tobacco',
  'Pineapple Coconut', 'Pineapple Lemon Ice', 'Pineapple Mango', 'Pink Bomb', 'R.b Banana',
  'Root.b', 'Raging Ice', 'Raspberry Ice', 'Raspberry Watermelon Ice', 'Razz Mango Iced',
  'Strawberry Kiwi', 'Skit', 'Spritz', 'Strawberry Banana', 'Strawberry Coconut Pineapple',
  'Strawberry Orange', 'Strawberry Raspberry Ice', 'Strawberry Tobacco',
  'Summer Watermelon Ice', 'Super Sour', 'Tobacco', 'Tobacco & Cream', 'Triple Berry',
  'Triple Berry Peach', 'Vanilla Iced Coffee', 'Watermelon Ice', 'Watermelon G',
  'Watermelon Peach', 'White Peach', 'Wild White Grape Iced',
];

// ---------------------------------------------------------------------------------------------
// Step A: find the real Gcore brand metaobject under "E-Liquids / Vape Juice"
// ---------------------------------------------------------------------------------------------

const METAOBJECTS_QUERY = /* GraphQL */ `
  query ListMetaobjects($type: String!) {
    metaobjects(type: $type, first: 250) {
      nodes {
        id
        fields { key value reference { ... on Metaobject { id } } }
      }
    }
  }
`;

function fieldValue(fields: Array<{ key: string; value: string | null }>, key: string) {
  return fields.find((f) => f.key === key)?.value ?? null;
}
function fieldRefId(
  fields: Array<{ key: string; reference: { id: string } | null }>,
  key: string
) {
  return fields.find((f) => f.key === key)?.reference?.id ?? null;
}

async function findGcoreBrandId(): Promise<string> {
  const subcats = await shopifyAdminRequest<any>(METAOBJECTS_QUERY, { type: 'sub_category' });
  const subcat = subcats.metaobjects.nodes.find(
    (n: any) => fieldValue(n.fields, 'name')?.trim().toLowerCase() === SUB_CATEGORY_NAME.toLowerCase()
  );
  if (!subcat) throw new Error(`Sub-category "${SUB_CATEGORY_NAME}" not found`);

  const brands = await shopifyAdminRequest<any>(METAOBJECTS_QUERY, { type: 'brand' });
  const brand = brands.metaobjects.nodes.find(
    (n: any) =>
      fieldValue(n.fields, 'name')?.trim().toLowerCase() === BRAND_NAME.toLowerCase() &&
      fieldRefId(n.fields, 'sub_category') === subcat.id
  );
  if (!brand) throw new Error(`Brand "${BRAND_NAME}" not found under "${SUB_CATEGORY_NAME}"`);
  return brand.id;
}

// ---------------------------------------------------------------------------------------------
// Step B: create the Product Line
// ---------------------------------------------------------------------------------------------

const PRODUCT_CREATE_MUTATION = /* GraphQL */ `
  mutation ProductCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product { id title handle }
      userErrors { field message }
    }
  }
`;

async function createProductLine(brandId: string): Promise<{ id: string; handle: string }> {
  const data = await shopifyAdminRequest<any>(PRODUCT_CREATE_MUTATION, {
    product: {
      title: TITLE,
      productOptions: [{ name: 'Flavor', values: [{ name: 'Default' }] }],
      metafields: [{ namespace: 'taxonomy', key: 'brand', type: 'metaobject_reference', value: brandId }],
    },
  });
  assertNoUserErrors(data.productCreate.userErrors, 'productCreate');
  const created = data.productCreate.product;
  if (!created) throw new Error('productCreate returned no product and no userErrors');
  console.log(`Created product: ${created.title} (${created.id}), handle: ${created.handle}`);
  return created;
}

// ---------------------------------------------------------------------------------------------
// Step C: generate a visually distinct PNG per flavour, upload all of them as product media
// ---------------------------------------------------------------------------------------------

function hashToHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

async function generateFlavourImage(name: string): Promise<Buffer> {
  const hue = hashToHue(name);
  const bg = `hsl(${hue}, 65%, 55%)`;
  const svg = `
    <svg width="600" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="600" height="600" fill="${bg}" />
      <text x="300" y="300" font-size="42" font-family="sans-serif" font-weight="bold"
        fill="white" text-anchor="middle" dominant-baseline="middle">
        ${name.replace(/&/g, '&amp;')}
      </text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const STAGED_UPLOADS_CREATE_MUTATION = /* GraphQL */ `
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }
`;

const CREATE_MEDIA_MUTATION = /* GraphQL */ `
  mutation CreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { id }
      mediaUserErrors { field message }
    }
  }
`;

/** Stages + uploads every flavour's image, then registers them all as product media in batches,
 * returning a Map from flavour name -> MediaImage GID (the only field that reliably attaches an
 * image to a variant on productVariantsBulkCreate, per variants.ts's own proven finding). */
async function uploadAllFlavourImages(productId: string, names: string[]): Promise<Map<string, string>> {
  const mediaIdByName = new Map<string, string>();
  const STAGE_BATCH = 25;

  for (let i = 0; i < names.length; i += STAGE_BATCH) {
    const batchNames = names.slice(i, i + STAGE_BATCH);
    console.log(`Images: staging batch ${i / STAGE_BATCH + 1} (${batchNames.length} images)...`);

    const stagedData = await shopifyAdminRequest<any>(STAGED_UPLOADS_CREATE_MUTATION, {
      input: batchNames.map((name, idx) => ({
        filename: `gcore-${i + idx}.png`,
        mimeType: 'image/png',
        httpMethod: 'POST',
        resource: 'IMAGE',
      })),
    });
    assertNoUserErrors(stagedData.stagedUploadsCreate.userErrors, 'stagedUploadsCreate');
    const targets = stagedData.stagedUploadsCreate.stagedTargets;

    const resourceUrls: string[] = [];
    for (let j = 0; j < batchNames.length; j++) {
      const name = batchNames[j];
      const target = targets[j];
      const buffer = await generateFlavourImage(name);
      const file = new File([new Uint8Array(buffer)], `gcore-${i + j}.png`, { type: 'image/png' });

      const form = new FormData();
      for (const param of target.parameters) form.append(param.name, param.value);
      form.append('file', file);
      const uploadRes = await fetch(target.url, { method: 'POST', body: form });
      if (!uploadRes.ok) throw new Error(`Upload failed for "${name}": ${uploadRes.status}`);
      resourceUrls.push(target.resourceUrl);
    }

    console.log(`Images: registering batch ${i / STAGE_BATCH + 1} as product media...`);
    const mediaData = await shopifyAdminRequest<any>(CREATE_MEDIA_MUTATION, {
      productId,
      media: resourceUrls.map((url) => ({ originalSource: url, mediaContentType: 'IMAGE' })),
    });
    if (mediaData.productCreateMedia.mediaUserErrors?.length > 0) {
      console.log('mediaUserErrors:', JSON.stringify(mediaData.productCreateMedia.mediaUserErrors, null, 2));
    }
    const mediaNodes = mediaData.productCreateMedia.media;
    for (let j = 0; j < batchNames.length; j++) {
      if (mediaNodes[j]) mediaIdByName.set(batchNames[j], mediaNodes[j].id);
    }
  }

  return mediaIdByName;
}

// ---------------------------------------------------------------------------------------------
// Step D: bulk-create every flavour as a real variant, each with its own image
// ---------------------------------------------------------------------------------------------

const BULK_CREATE_MUTATION = /* GraphQL */ `
  mutation BulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: REMOVE_STANDALONE_VARIANT) {
      productVariants { id title }
      userErrors { field message }
    }
  }
`;

async function bulkCreateFlavourVariants(
  productId: string,
  names: string[],
  mediaIdByName: Map<string, string>
) {
  const BATCH_SIZE = 100;
  let created = 0;
  const errors: unknown[] = [];

  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const batch = names.slice(i, i + BATCH_SIZE);
    const variants = batch.map((name) => ({
      optionValues: [{ name: `${name} (${REGION})`, optionName: 'Flavor' }],
      price: PRICE,
      mediaId: mediaIdByName.get(name),
      metafields: [
        { namespace: 'custom', key: 'region', type: 'single_line_text_field', value: REGION },
        { namespace: 'custom', key: 'flavour_description', type: 'multi_line_text_field', value: `${name} flavour.` },
      ],
      inventoryQuantities: [{ availableQuantity: QUANTITY, locationId: INVENTORY_LOCATION_ID }],
    }));

    const data = await shopifyAdminRequest<any>(BULK_CREATE_MUTATION, { productId, variants });
    const userErrors = data.productVariantsBulkCreate.userErrors ?? [];
    const createdCount = data.productVariantsBulkCreate.productVariants?.length ?? 0;
    created += createdCount;
    if (userErrors.length > 0) {
      console.log(`Batch ${i / BATCH_SIZE + 1} userErrors:`, JSON.stringify(userErrors, null, 2));
      errors.push(...userErrors);
    }
    console.log(`Variants: batch ${i / BATCH_SIZE + 1} created ${createdCount}/${batch.length}`);
  }

  return { created, errors };
}

// ---------------------------------------------------------------------------------------------
// Step E: publish to Online Store
// ---------------------------------------------------------------------------------------------

const GET_PUBLICATIONS_QUERY = /* GraphQL */ `
  query GetPublications { publications(first: 10) { nodes { id name } } }
`;
const PUBLISH_MUTATION = /* GraphQL */ `
  mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) { userErrors { field message } }
  }
`;

async function publishToAllChannels(productId: string) {
  const data = await shopifyAdminRequest<any>(GET_PUBLICATIONS_QUERY);
  const publications = data.publications.nodes;
  console.log('Available publications/channels:', publications.map((p: any) => p.name).join(', '));
  const result = await shopifyAdminRequest<any>(PUBLISH_MUTATION, {
    id: productId,
    input: publications.map((p: any) => ({ publicationId: p.id })),
  });
  assertNoUserErrors(result.publishablePublish.userErrors, 'publishablePublish');
  console.log(`Published to ${publications.length} channel(s).`);
}

// ---------------------------------------------------------------------------------------------

async function main() {
  console.log(`Flavours to create: ${FLAVOURS.length}`);

  const brandId = await findGcoreBrandId();
  console.log(`Found Gcore brand: ${brandId}`);

  const product = await createProductLine(brandId);

  const mediaIdByName = await uploadAllFlavourImages(product.id, FLAVOURS);
  console.log(`Uploaded ${mediaIdByName.size}/${FLAVOURS.length} distinct images.`);

  const result = await bulkCreateFlavourVariants(product.id, FLAVOURS, mediaIdByName);
  console.log(`Variants created: ${result.created}/${FLAVOURS.length}, errors: ${result.errors.length}`);

  await publishToAllChannels(product.id);

  console.log(`\nDONE. Product handle: ${product.handle}`);
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
