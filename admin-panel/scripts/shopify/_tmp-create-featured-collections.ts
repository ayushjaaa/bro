/**
 * One-time setup: makes sure the four Shopify collections the storefront's homepage Featured
 * Brands tabs read from (src/lib/shopify/queries/featured-sections.ts in the storefront repo)
 * exist and are published to the "Online Store" sales channel -- the Storefront API's
 * `collection(handle:)` returns null for an unpublished collection, so an unpublished one stays
 * an empty tab no matter how many products the admin adds. Custom (manual) collections, empty to
 * start; products get added via the admin-panel "Featured" page / per-product toggle.
 *
 * Idempotent: skips creating a handle that already exists, and re-publishing is a no-op.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-create-featured-collections.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const COLLECTIONS = [
  { title: 'Best Sellers', handle: 'best-sellers' },
  { title: 'New Arrivals', handle: 'new-arrivals' },
  { title: 'Trending', handle: 'trending' },
  { title: 'Promotions', handle: 'promotions' },
];

const BY_HANDLE_QUERY = /* GraphQL */ `
  query CollectionByHandle($handle: String!) {
    collectionByHandle(handle: $handle) {
      id
    }
  }
`;

const CREATE_MUTATION = /* GraphQL */ `
  mutation CreateCollection($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PUBLISH_MUTATION = /* GraphQL */ `
  mutation PublishCollection($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

async function getOnlineStorePublicationId(): Promise<string> {
  const data = await shopifyAdminRequest<any>(`query { publications(first: 10) { nodes { id name } } }`);
  const publication = data.publications.nodes.find((p: any) => p.name === 'Online Store');
  if (!publication) throw new Error('"Online Store" publication not found');
  return publication.id;
}

async function ensureOne(title: string, handle: string, publicationId: string) {
  const existing = await shopifyAdminRequest<any>(BY_HANDLE_QUERY, { handle });
  let id: string | undefined = existing.collectionByHandle?.id;

  if (id) {
    console.log(`EXISTS ${handle} -> ${id}`);
  } else {
    const data = await shopifyAdminRequest<any>(CREATE_MUTATION, { input: { title, handle } });
    const errors = data.collectionCreate.userErrors;
    if (errors?.length) {
      console.log(`FAIL create ${handle}: ${JSON.stringify(errors)}`);
      return;
    }
    id = data.collectionCreate.collection.id;
    console.log(`CREATED ${handle} -> ${id}`);
  }

  const pub = await shopifyAdminRequest<any>(PUBLISH_MUTATION, { id, input: [{ publicationId }] });
  const pubErrors = pub.publishablePublish.userErrors;
  console.log(pubErrors?.length ? `FAIL publish ${handle}: ${JSON.stringify(pubErrors)}` : `PUBLISHED ${handle}`);
}

async function main() {
  const publicationId = await getOnlineStorePublicationId();
  for (const c of COLLECTIONS) await ensureOne(c.title, c.handle, publicationId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
