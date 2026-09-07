// No `server-only` import here deliberately, same reason as admin-client.core.ts: this file is
// imported both by the Next.js app (via src/data/taxonomy.ts, which does have the guard) and by
// standalone scripts run directly via tsx/Node (scripts/shopify/backfill-subcategory-collections.ts),
// where `server-only` always throws regardless of context. Do not import this file from
// browser-reachable code -- it's meant to be reached only through the guarded `taxonomy.ts` (app)
// or a script (Node).

import { shopifyAdminRequest, assertNoUserErrors } from './admin-client.core';

/**
 * Mega-menu Collection auto-creation (2026-09-07) -- one flat Automated Collection per
 * Sub-category (rule: product_type equals <name>), published to Online Store so the Storefront
 * API can read it. Deliberately separate from the metaobject taxonomy in data/taxonomy.ts: a
 * Collection is the thing the storefront's live mega-menu actually reads products from (see
 * storefront/src/lib/shopify/queries/mega-menu-collections.ts). The mega-menu's own Panel-1
 * grouping (which Collections appear under which nav dropdown, and how they're grouped) is set
 * afterward, directly on the Collection, via 4 plain metafields
 * (custom.menu_nav_key/menu_group_label/menu_group_mode/menu_sort_order -- see
 * scripts/shopify/create-mega-menu-collection-metafields.ts) -- left blank by default, so a new
 * Collection never appears in the mega menu until an admin deliberately opts it in.
 */

const GET_ONLINE_STORE_PUBLICATION_QUERY = /* GraphQL */ `
  query GetOnlineStorePublicationForCollections {
    publications(first: 10) {
      nodes {
        id
        name
      }
    }
  }
`;

async function getOnlineStorePublicationId(): Promise<string> {
  const data = await shopifyAdminRequest<any>(GET_ONLINE_STORE_PUBLICATION_QUERY);
  const publication = data.publications.nodes.find((p: any) => p.name === 'Online Store');
  if (!publication) throw new Error('"Online Store" publication not found for this store');
  return publication.id;
}

const COLLECTION_CREATE_MUTATION = /* GraphQL */ `
  mutation CollectionCreateForSubcategory($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PUBLISHABLE_PUBLISH_MUTATION_FOR_COLLECTION = /* GraphQL */ `
  mutation PublishCollectionForTaxonomy($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Creates (and publishes) an Automated Collection matching one Sub-category's name, via
 * `product_type equals <name>` (verified 2026-09-07 against the store's pinned 2026-07 Admin API:
 * `CollectionRuleSetInput`/`CollectionRuleInput` with `column: TYPE, relation: EQUALS` still works
 * in this API version -- the newer `sources`-based model is additive, not a hard replacement).
 * Every product already carries its Sub-category as this exact `product_type` string
 * (create-product-subcategory-metafield.ts / the product creation flow), so no per-product
 * tagging step is needed here -- matching products populate the Collection automatically.
 *
 * Callers are responsible for idempotency (checking whether a matching Collection already
 * exists) if that matters for their case -- see backfill-subcategory-collections.ts.
 */
export async function createSubcategoryCollection(subcategoryName: string): Promise<string> {
  const createData = await shopifyAdminRequest<any>(COLLECTION_CREATE_MUTATION, {
    input: {
      title: subcategoryName,
      ruleSet: {
        appliedDisjunctively: false,
        rules: [{ column: 'TYPE', relation: 'EQUALS', condition: subcategoryName }],
      },
    },
  });
  assertNoUserErrors(createData.collectionCreate.userErrors, 'collectionCreate');
  const collectionId = createData.collectionCreate.collection?.id;
  if (!collectionId) throw new Error(`collectionCreate returned no collection for "${subcategoryName}"`);

  const publicationId = await getOnlineStorePublicationId();
  const publishData = await shopifyAdminRequest<any>(PUBLISHABLE_PUBLISH_MUTATION_FOR_COLLECTION, {
    id: collectionId,
    input: [{ publicationId }],
  });
  assertNoUserErrors(publishData.publishablePublish.userErrors, 'publishablePublish');

  return collectionId;
}

const METAFIELDS_SET_MUTATION = /* GraphQL */ `
  mutation SetMegaMenuMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Sets the 4 mega-menu placement metafields (custom.menu_nav_key/menu_group_label/
 * menu_group_mode/menu_sort_order) on a Collection in one call. Only fields with a non-empty
 * value are included -- an omitted field here means "leave whatever's already there," not "clear
 * it" (matches metafieldsSet's own semantics: it only touches the keys you pass).
 *
 * Values are trimmed defensively before sending, same reasoning as the storefront's
 * mega-menu-collections.ts .trim() fix: even though the admin-panel form uses fixed dropdowns for
 * navKey/groupMode (eliminating that whitespace-typo bug class at the source for anything created
 * this way), groupLabel is still free text, and this function may also be called for edits made
 * outside the dropdown-constrained form later.
 */
export async function setMegaMenuMetafields(
  collectionId: string,
  input: { navKey?: string; groupLabel?: string; groupMode?: string; sortOrder?: number }
): Promise<void> {
  const metafields: Array<{ ownerId: string; namespace: string; key: string; type: string; value: string }> = [];

  const addTextField = (key: string, value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) metafields.push({ ownerId: collectionId, namespace: 'custom', key, type: 'single_line_text_field', value: trimmed });
  };

  addTextField('menu_nav_key', input.navKey);
  addTextField('menu_group_label', input.groupLabel);
  addTextField('menu_group_mode', input.groupMode);
  if (input.sortOrder !== undefined && !Number.isNaN(input.sortOrder)) {
    metafields.push({
      ownerId: collectionId,
      namespace: 'custom',
      key: 'menu_sort_order',
      type: 'number_integer',
      value: String(Math.trunc(input.sortOrder)),
    });
  }

  if (metafields.length === 0) return;

  const data = await shopifyAdminRequest<any>(METAFIELDS_SET_MUTATION, { metafields });
  assertNoUserErrors(data.metafieldsSet.userErrors, 'metafieldsSet');
}
