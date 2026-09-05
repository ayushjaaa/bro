/**
 * One-time backfill -- sets Shopify's native `productType`, `vendor`, and a `region-<value>` tag
 * on every existing product, derived from its taxonomy.brand -> sub_category -> name chain and its
 * existing custom.region metafield (PRODUCT_PAGE_PLAN.md native filtering architecture,
 * 2026-09-04). These native fields power fast `products(query: "product_type:... AND vendor:...
 * AND tag:...")` filtering on the storefront -- products created before this backfill (or before
 * createProductLine started setting these at creation time) won't be findable by that query until
 * this runs. Safe to re-run (idempotent -- skips products that already match).
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/backfill-native-taxonomy-fields.ts
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const LIST_QUERY = /* GraphQL */ `
  query List($after: String) {
    products(first: 250, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        productType
        vendor
        tags
        brandField: metafield(namespace: "taxonomy", key: "brand") {
          reference {
            ... on Metaobject {
              brandName: field(key: "name") { value }
              subCategoryField: field(key: "sub_category") {
                reference { ... on Metaobject { subCategoryName: field(key: "name") { value } } }
              }
            }
          }
        }
        regionField: metafield(namespace: "custom", key: "region") { value }
      }
    }
  }
`;

const UPDATE_MUTATION = /* GraphQL */ `
  mutation Update($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id }
      userErrors { field message }
    }
  }
`;

async function main() {
  let after: string | null = null;
  let updated = 0;
  let skipped = 0;
  let noBrandChain = 0;

  while (true) {
    const data: any = await shopifyAdminRequest<any>(LIST_QUERY, { after });

    for (const p of data.products.nodes) {
      const vendor = p.brandField?.reference?.brandName?.value;
      const productType = p.brandField?.reference?.subCategoryField?.reference?.subCategoryName?.value;
      const region = p.regionField?.value;

      if (!vendor || !productType) {
        noBrandChain++;
        console.log(`  SKIP (no brand/sub-category): ${p.title}`);
        continue;
      }

      const regionTag = region ? `region-${region}` : null;
      const existingTags: string[] = p.tags ?? [];
      const tags = regionTag && !existingTags.includes(regionTag) ? [...existingTags, regionTag] : existingTags;

      const alreadyCorrect =
        p.productType === productType &&
        p.vendor === vendor &&
        (!regionTag || existingTags.includes(regionTag));
      if (alreadyCorrect) {
        skipped++;
        continue;
      }

      const result = await shopifyAdminRequest<any>(UPDATE_MUTATION, {
        product: { id: p.id, productType, vendor, tags },
      });
      assertNoUserErrors(result.productUpdate.userErrors, `productUpdate (${p.title})`);
      updated++;
      console.log(`  updated: ${p.title} -> productType="${productType}" vendor="${vendor}" tags=${JSON.stringify(tags)}`);
    }

    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }

  console.log(`\nDone. Updated: ${updated}, already correct: ${skipped}, no brand/sub-category: ${noBrandChain}.`);
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  if ((err as any)?.errors) console.error('Details:', JSON.stringify((err as any).errors, null, 2));
  process.exit(1);
});
