import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from '@/lib/shopify/admin-client';
import { requireAdmin } from './admin-auth';

/**
 * Manages the four curated Shopify collections the storefront's homepage "Featured Brands" tab
 * row reads from (handles `best-sellers` / `new-arrivals` / `trending` / `promotions` -- see the
 * storefront repo's src/lib/shopify/queries/featured-sections.ts). The storefront shows exactly
 * these lists, in this order -- the homepage tab is the first HOMEPAGE_SLOTS products of each
 * (latest-added first, see setProductFeatured), and "View all" shows the whole list.
 * Collections were created once via scripts/shopify/_tmp-create-featured-collections.ts and set
 * to MANUAL sort via scripts/shopify/_tmp-seed-featured-collections.ts.
 */

export const FEATURED_COLLECTION_KEYS = ['best-sellers', 'new-arrivals', 'trending', 'promotions'] as const;

export type FeaturedCollectionKey = (typeof FEATURED_COLLECTION_KEYS)[number];

/** How many products each homepage tab shows -- matches `getFeaturedSections(4)` in the
 * storefront's app/page.tsx. The rest of a list only appears on that tab's "View all" page. */
export const HOMEPAGE_SLOTS = 4;

/** Display titles, also the admin panel's per-collection page headings (/featured/[key]). */
export const FEATURED_TITLES: Record<FeaturedCollectionKey, string> = {
  'best-sellers': 'Best Sellers',
  'new-arrivals': 'New Arrivals',
  trending: 'Trending',
  promotions: 'Promotions',
};

export function isFeaturedCollectionKey(value: string): value is FeaturedCollectionKey {
  return (FEATURED_COLLECTION_KEYS as readonly string[]).includes(value);
}

const COLLECTION_HANDLES: Record<FeaturedCollectionKey, string> = {
  'best-sellers': 'best-sellers',
  'new-arrivals': 'new-arrivals',
  trending: 'trending',
  promotions: 'promotions',
};

export type FeaturedProduct = {
  id: string;
  title: string;
  imageUrl: string | null;
  /** Unpublished products sit in the collection but the storefront (Storefront API) skips them,
   * so the admin UI flags them -- otherwise a fresh, not-yet-published product would look like
   * it's on the homepage when it isn't. */
  isPublished: boolean;
};

function toFeaturedProduct(n: any): FeaturedProduct {
  return { id: n.id, title: n.title, imageUrl: n.featuredImage?.url ?? null, isPublished: n.publishedAt !== null };
}

async function getCollectionId(key: FeaturedCollectionKey): Promise<string> {
  const data = await shopifyAdminRequest<any>(
    /* GraphQL */ `
      query CollectionId($handle: String!) {
        collectionByHandle(handle: $handle) {
          id
        }
      }
    `,
    { handle: COLLECTION_HANDLES[key] }
  );
  const id = data.collectionByHandle?.id;
  if (!id) {
    throw new Error(
      `"${COLLECTION_HANDLES[key]}" collection doesn't exist in Shopify -- run scripts/shopify/_tmp-create-featured-collections.ts`
    );
  }
  return id;
}

/** Every product currently in a featured collection, in the collection's manual order (= the
 * order the storefront shows them; newly added products go to the top). Pages through the whole
 * collection 250 at a time -- these lists have no size limit, only the homepage's first
 * HOMEPAGE_SLOTS matter for the homepage tab. */
export async function listFeaturedProducts(key: FeaturedCollectionKey): Promise<FeaturedProduct[]> {
  await requireAdmin();
  const collectionId = await getCollectionId(key);
  const all: FeaturedProduct[] = [];
  let after: string | null = null;
  do {
    const data: any = await shopifyAdminRequest<any>(
      /* GraphQL */ `
        query FeaturedProducts($id: ID!, $after: String) {
          collection(id: $id) {
            products(first: 250, after: $after) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                title
                publishedAt
                featuredImage {
                  url
                }
              }
            }
          }
        }
      `,
      { id: collectionId, after }
    );
    const page = data.collection?.products;
    all.push(...(page?.nodes ?? []).map(toFeaturedProduct));
    after = page?.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return all;
}

/** Title search over the whole catalog, for the "add a product" picker -- Shopify's search
 * syntax (`title:*text*`) rather than a dedicated search field, same approach as other
 * free-text lookups in this codebase. */
export async function searchProductsForFeatured(query: string, limit = 10): Promise<FeaturedProduct[]> {
  await requireAdmin();
  const trimmed = query.trim();
  if (!trimmed) return [];
  const data = await shopifyAdminRequest<any>(
    /* GraphQL */ `
      query SearchProducts($query: String!, $first: Int!) {
        products(first: $first, query: $query) {
          nodes {
            id
            title
            publishedAt
            featuredImage {
              url
            }
          }
        }
      }
    `,
    { query: `title:*${trimmed}*`, first: limit }
  );
  return (data.products.nodes ?? []).map(toFeaturedProduct);
}

/** Whether a given product is currently in each featured collection -- used by the per-product
 * toggle on the Product Line detail page. Reads the product's own collection list rather than
 * each collection's product list, since a product only ever belongs to a handful of collections
 * (cheap either direction, but this one call covers both keys at once). */
export async function getProductFeaturedStatus(
  productId: string
): Promise<Record<FeaturedCollectionKey, boolean>> {
  await requireAdmin();
  const data = await shopifyAdminRequest<any>(
    /* GraphQL */ `
      query ProductCollections($id: ID!) {
        product(id: $id) {
          collections(first: 20) {
            nodes {
              handle
            }
          }
        }
      }
    `,
    { id: productId }
  );
  const handles: string[] = (data.product?.collections.nodes ?? []).map((n: any) => n.handle);
  return Object.fromEntries(
    FEATURED_COLLECTION_KEYS.map((key) => [key, handles.includes(COLLECTION_HANDLES[key])])
  ) as Record<FeaturedCollectionKey, boolean>;
}

const ADD_PRODUCTS_MUTATION = /* GraphQL */ `
  mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) {
    collectionAddProductsV2(id: $id, productIds: $productIds) {
      job {
        id
        done
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const REMOVE_PRODUCTS_MUTATION = /* GraphQL */ `
  mutation CollectionRemoveProducts($id: ID!, $productIds: [ID!]!) {
    collectionRemoveProducts(id: $id, productIds: $productIds) {
      userErrors {
        field
        message
      }
    }
  }
`;

const JOB_QUERY = /* GraphQL */ `
  query Job($id: ID!) {
    job(id: $id) {
      done
    }
  }
`;

/** Polls a Shopify background job until done (or ~10s pass -- then gives up quietly; the add
 * itself still completes, only the follow-up move-to-top would be skipped). */
async function waitForJob(job: { id: string; done: boolean } | null | undefined): Promise<boolean> {
  if (!job || job.done) return true;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const data = await shopifyAdminRequest<any>(JOB_QUERY, { id: job.id });
    if (data.job?.done) return true;
  }
  return false;
}

/** Adds or removes one product from a featured collection. An added product is moved to the top
 * (position 0), so the list always runs latest-added first and the homepage tab -- the first
 * HOMEPAGE_SLOTS products -- shows the latest additions, with older ones only on "View all".
 * Shopify's add runs as a background job, so the move waits for it to finish first. */
export async function setProductFeatured(
  key: FeaturedCollectionKey,
  productId: string,
  featured: boolean
): Promise<void> {
  await requireAdmin();
  const collectionId = await getCollectionId(key);
  if (featured) {
    const data = await shopifyAdminRequest<any>(ADD_PRODUCTS_MUTATION, {
      id: collectionId,
      productIds: [productId],
    });
    assertNoUserErrors(data.collectionAddProductsV2.userErrors, 'collectionAddProductsV2');
    if (await waitForJob(data.collectionAddProductsV2.job)) {
      const move = await shopifyAdminRequest<any>(REORDER_PRODUCTS_MUTATION, {
        id: collectionId,
        moves: [{ id: productId, newPosition: '0' }],
      });
      assertNoUserErrors(move.collectionReorderProducts.userErrors, 'collectionReorderProducts');
    }
  } else {
    const data = await shopifyAdminRequest<any>(REMOVE_PRODUCTS_MUTATION, {
      id: collectionId,
      productIds: [productId],
    });
    assertNoUserErrors(data.collectionRemoveProducts.userErrors, 'collectionRemoveProducts');
  }
}

const REORDER_PRODUCTS_MUTATION = /* GraphQL */ `
  mutation CollectionReorderProducts($id: ID!, $moves: [MoveInput!]!) {
    collectionReorderProducts(id: $id, moves: $moves) {
      userErrors {
        field
        message
      }
    }
  }
`;

/** Moves one product to a 0-based position in a featured collection (requires MANUAL sort, set
 * by scripts/shopify/_tmp-seed-featured-collections.ts). Runs as a Shopify background job, same
 * as add/remove above. */
export async function moveFeaturedProduct(
  key: FeaturedCollectionKey,
  productId: string,
  newPosition: number
): Promise<void> {
  await requireAdmin();
  const collectionId = await getCollectionId(key);
  const data = await shopifyAdminRequest<any>(REORDER_PRODUCTS_MUTATION, {
    id: collectionId,
    moves: [{ id: productId, newPosition: String(newPosition) }],
  });
  assertNoUserErrors(data.collectionReorderProducts.userErrors, 'collectionReorderProducts');
}

/** Removes every product from a featured collection (the storefront tab then shows its empty
 * state), 250 per call -- Shopify's per-mutation cap for collectionRemoveProducts. */
export async function clearFeaturedProducts(key: FeaturedCollectionKey): Promise<void> {
  const products = await listFeaturedProducts(key); // does requireAdmin()
  if (products.length === 0) return;
  const collectionId = await getCollectionId(key);
  for (let i = 0; i < products.length; i += 250) {
    const data = await shopifyAdminRequest<any>(REMOVE_PRODUCTS_MUTATION, {
      id: collectionId,
      productIds: products.slice(i, i + 250).map((p) => p.id),
    });
    assertNoUserErrors(data.collectionRemoveProducts.userErrors, 'collectionRemoveProducts');
  }
}
