/**
 * One-time follow-up to _tmp-create-featured-collections.ts:
 *  1. Sets all four featured collections to MANUAL sort, so the order the admin panel's Featured
 *     page lists products in is exactly the order the storefront shows them (homepage = first 4).
 *     New collections default to MOST_RELEVANT, which made that order unpredictable.
 *  2. Seeds Best Sellers / New Arrivals (only if still empty) with the products the storefront
 *     was showing automatically (top-selling / newest), so switching those tabs to admin-only
 *     control doesn't change what's on the homepage until an admin edits the list.
 *     Handles captured 2026-10-20 from the Storefront API's BEST_SELLING / CREATED_AT sorts.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-seed-featured-collections.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const SEED: Record<string, string[]> = {
  'best-sellers': [
    'mr-fog-nova-36k-bubble-gang-series-disposable-5ct-federal',
    'juicy-jay-superfine-rolling-papers-1',
    'skunk-rolling-papers-1',
    'raw-black-organic-hemp-1-1-4-rolling-papers-pack-24',
  ],
  'new-arrivals': [
    'juicy-jay-superfine-rolling-papers-1',
    'skunk-rolling-papers-1',
    'raw-black-organic-hemp-1-1-4-rolling-papers-pack-24',
    'raw-300-s-1-rolling-papers-pack-300-box-20',
  ],
  trending: [],
  promotions: [],
};

async function main() {
  for (const [handle, productHandles] of Object.entries(SEED)) {
    const c = await shopifyAdminRequest<any>(
      `query($h: String!) { collectionByHandle(handle: $h) { id productsCount { count } } }`,
      { h: handle }
    );
    const collection = c.collectionByHandle;
    if (!collection) {
      console.log(`MISSING ${handle} -- run _tmp-create-featured-collections.ts first`);
      continue;
    }

    const upd = await shopifyAdminRequest<any>(
      `mutation($input: CollectionInput!) { collectionUpdate(input: $input) { userErrors { field message } } }`,
      { input: { id: collection.id, sortOrder: 'MANUAL' } }
    );
    const updErrors = upd.collectionUpdate.userErrors;
    console.log(updErrors?.length ? `FAIL sort ${handle}: ${JSON.stringify(updErrors)}` : `MANUAL ${handle}`);

    if (productHandles.length === 0) continue;
    if (collection.productsCount.count > 0) {
      console.log(`SKIP seed ${handle} (already has ${collection.productsCount.count} products)`);
      continue;
    }

    const productIds: string[] = [];
    for (const ph of productHandles) {
      const p = await shopifyAdminRequest<any>(
        `query($h: String!) { productByIdentifier(identifier: { handle: $h }) { id } }`,
        { h: ph }
      );
      const id = p.productByIdentifier?.id;
      if (id) productIds.push(id);
      else console.log(`  not found: ${ph}`);
    }

    const add = await shopifyAdminRequest<any>(
      `mutation($id: ID!, $productIds: [ID!]!) { collectionAddProductsV2(id: $id, productIds: $productIds) { userErrors { field message } } }`,
      { id: collection.id, productIds }
    );
    const addErrors = add.collectionAddProductsV2.userErrors;
    console.log(addErrors?.length ? `FAIL seed ${handle}: ${JSON.stringify(addErrors)}` : `SEEDED ${handle} (${productIds.length})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
