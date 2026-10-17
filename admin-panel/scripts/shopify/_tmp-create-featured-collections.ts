/**
 * One-time setup: creates the "trending" and "promotions" Shopify collections that the
 * storefront's homepage Featured Brands tabs already read from (src/lib/shopify/queries/
 * featured-sections.ts in the storefront repo) but that don't exist yet in Shopify -- confirmed
 * via collectionByHandle returning null for both. Custom (manual) collections, empty to start;
 * products get added via the new admin-panel "Featured" page / per-product toggle.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-create-featured-collections.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const CREATE_MUTATION = /* GraphQL */ `
  mutation CreateCollection($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        handle
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function createOne(title: string, handle: string) {
  const data = await shopifyAdminRequest<any>(CREATE_MUTATION, { input: { title, handle } });
  const errors = data.collectionCreate.userErrors;
  if (errors?.length) {
    console.log(`FAIL ${handle}: ${JSON.stringify(errors)}`);
    return;
  }
  console.log(`OK ${handle} -> ${data.collectionCreate.collection.id}`);
}

async function main() {
  await createOne('Trending', 'trending');
  await createOne('Promotions', 'promotions');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
