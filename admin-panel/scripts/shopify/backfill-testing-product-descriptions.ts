/**
 * One-time backfill: the taxonomy/price-test seed scripts (seed-testing-products.ts,
 * seed-testing-price-products.ts) never set descriptionHtml, so every seeded test product's
 * storefront description renders as an empty string -- not a storefront rendering bug
 * (ProductPage.tsx just prints whatever Shopify returns), confirmed by reading these products'
 * bodyHtml directly via the Admin API (all blank). This sets a placeholder description on every
 * product still missing one, so the storefront's description section has something to show while
 * testing. Skips any product that already has a non-empty description (real catalog entries, once
 * those exist, keep their own copy).
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/backfill-testing-product-descriptions.ts
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const LIST_QUERY = /* GraphQL */ `
  query ListProducts($cursor: String) {
    products(first: 100, after: $cursor) {
      nodes {
        id
        title
        bodyHtml
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = /* GraphQL */ `
  mutation ProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      userErrors { field message }
    }
  }
`;

async function main() {
  let cursor: string | null = null;
  let updated = 0;
  let skipped = 0;

  do {
    const data: any = await shopifyAdminRequest(LIST_QUERY, { cursor });
    for (const product of data.products.nodes) {
      if (product.bodyHtml && product.bodyHtml.trim().length > 0) {
        skipped++;
        continue;
      }
      const result: any = await shopifyAdminRequest(PRODUCT_UPDATE_MUTATION, {
        product: {
          id: product.id,
          descriptionHtml: `<p>Test product copy for ${product.title}. Placeholder text, not real product content.</p>`,
        },
      });
      assertNoUserErrors(result.productUpdate.userErrors, `productUpdate(${product.title})`);
      console.log(`  updated: ${product.title}`);
      updated++;
    }
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);

  console.log(`\nDone. Updated ${updated}, skipped ${skipped} (already had a description).`);
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
