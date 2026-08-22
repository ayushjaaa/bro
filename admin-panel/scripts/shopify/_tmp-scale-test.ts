import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const PRODUCT_ID = 'gid://shopify/Product/10434658140460';
const OPTION_NAME = 'Flavor';
const REGIONS = ['federal', 'bc', 'alberta', 'manitoba', 'ontario', 'quebec'];
const FLAVOUR_COUNT = 200;
const BATCH_SIZE = 100;

const MUTATION = /* GraphQL */ `
  mutation BulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: DEFAULT) {
      productVariants {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function buildVariantInputs() {
  const inputs: any[] = [];
  for (let f = 1; f <= FLAVOUR_COUNT; f++) {
    for (const region of REGIONS) {
      const flavourName = `Test Flavour ${String(f).padStart(3, '0')}`;
      inputs.push({
        optionValues: [{ name: `${flavourName} (${region})`, optionName: OPTION_NAME }],
        price: '20.00',
        metafields: [
          { namespace: 'custom', key: 'region', type: 'single_line_text_field', value: region },
          {
            namespace: 'custom',
            key: 'flavour_description',
            type: 'multi_line_text_field',
            value: `${flavourName} test description`,
          },
        ],
      });
    }
  }
  return inputs;
}

async function main() {
  const allInputs = buildVariantInputs();
  console.log(`Total variants to create: ${allInputs.length}`);

  let created = 0;
  const errors: unknown[] = [];
  const start = Date.now();

  for (let i = 0; i < allInputs.length; i += BATCH_SIZE) {
    const batch = allInputs.slice(i, i + BATCH_SIZE);
    const batchNum = i / BATCH_SIZE + 1;
    try {
      const data = await shopifyAdminRequest<any>(MUTATION, {
        productId: PRODUCT_ID,
        variants: batch,
      });
      const userErrors = data.productVariantsBulkCreate.userErrors;
      if (userErrors && userErrors.length > 0) {
        console.log(`Batch ${batchNum}: userErrors ->`, JSON.stringify(userErrors, null, 2));
        errors.push(...userErrors);
      }
      const createdInBatch = data.productVariantsBulkCreate.productVariants.length;
      created += createdInBatch;
      console.log(`Batch ${batchNum}/${Math.ceil(allInputs.length / BATCH_SIZE)}: created ${createdInBatch} (running total: ${created})`);
    } catch (err) {
      console.error(`Batch ${batchNum} FAILED:`, err instanceof Error ? err.message : err);
      errors.push(err);
    }
  }

  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${seconds}s. Created: ${created}/${allInputs.length}. Errors: ${errors.length}`);
}

main();
