import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from '@/lib/shopify/admin-client';
import { requireAdmin } from './admin-auth';

/**
 * Manages the two curated Shopify collections the storefront's homepage "Featured Brands" tab
 * row reads from (handles `trending` / `promotions` -- see the storefront repo's
 * src/lib/shopify/queries/featured-sections.ts). Best Sellers and New Arrivals need no admin
 * management: they're native Shopify sort views over the whole catalog, not curated lists.
 * Collections themselves were created once via scripts/shopify/_tmp-create-featured-collections.ts.
 */

export type FeaturedCollectionKey = 'trending' | 'promotions';

const COLLECTION_HANDLES: Record<FeaturedCollectionKey, string> = {
  trending: 'trending',
  promotions: 'promotions',
};

export type FeaturedProduct = {
  id: string;
  title: string;
  imageUrl: string | null;
};

function toFeaturedProduct(n: any): FeaturedProduct {
  return { id: n.id, title: n.title, imageUrl: n.featuredImage?.url ?? null };
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

/** Products currently in a featured collection, newest-added first (Shopify's default manual
 * collection sort). Capped at 50 -- these are small, hand-curated lists, not full catalog pages. */
export async function listFeaturedProducts(key: FeaturedCollectionKey): Promise<FeaturedProduct[]> {
  await requireAdmin();
  const collectionId = await getCollectionId(key);
  const data = await shopifyAdminRequest<any>(
    /* GraphQL */ `
      query FeaturedProducts($id: ID!) {
        collection(id: $id) {
          products(first: 50) {
            nodes {
              id
              title
              featuredImage {
                url
              }
            }
          }
        }
      }
    `,
    { id: collectionId }
  );
  return (data.collection?.products.nodes ?? []).map(toFeaturedProduct);
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
  return {
    trending: handles.includes(COLLECTION_HANDLES.trending),
    promotions: handles.includes(COLLECTION_HANDLES.promotions),
  };
}

const ADD_PRODUCTS_MUTATION = /* GraphQL */ `
  mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) {
    collectionAddProductsV2(id: $id, productIds: $productIds) {
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

/** Adds or removes one product from a featured collection. Both Shopify mutations run as a
 * background job (not reflected in the very next read for a second or two), same as Shopify's
 * own admin UI -- acceptable here since this only drives a `revalidatePath` refresh, not an
 * immediate inline state update. */
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
  } else {
    const data = await shopifyAdminRequest<any>(REMOVE_PRODUCTS_MUTATION, {
      id: collectionId,
      productIds: [productId],
    });
    assertNoUserErrors(data.collectionRemoveProducts.userErrors, 'collectionRemoveProducts');
  }
}
