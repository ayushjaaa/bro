/**
 * One-time setup script — creates a Variant metafield definition ("Retail Price") backing the
 * retail/wholesale dual-pricing feature (DECISIONS.md items 12-14, 19-20). Shopify's native
 * variant `price` field already holds this business's wholesale/distributor pricing (left
 * untouched); retail price has no native Shopify field, so it goes through a `money`-typed
 * metafield, same pattern as create-variant-flavour-description-metafield.ts and
 * create-variant-region-metafield.ts.
 *
 * Deliberately grants Storefront API read access (`access.storefront: 'PUBLIC_READ'`) -- the
 * storefront app must never hold Admin API credentials for buyer-facing request paths (that
 * boundary is already established in this codebase: Admin API access lives only in admin-panel
 * plus one-off setup scripts, never in live customer-facing code). Granting Storefront access here
 * means storefront's existing Storefront API queries can read this field with the same public
 * token they already use for the native price -- no new credential, no extra round-trip.
 *
 * NOTE: the exact enum value for `access.storefront` is unverified against this store's live
 * schema (2026-07 API version) -- if `metafieldDefinitionCreate` errors on this field, run
 * `main()`'s introspection query below manually against the live store, read the real
 * `MetafieldStorefrontAccess` enum values from the result, and correct METAFIELD_STOREFRONT_ACCESS
 * before re-running.
 *
 * Idempotent: safe to re-run.
 *
 * Run: npm run shopify:create-variant-retail-price-metafield
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const METAFIELD_NAMESPACE = 'custom';
const METAFIELD_KEY = 'retail_price';
const METAFIELD_STOREFRONT_ACCESS = 'PUBLIC_READ';

interface MetafieldDefinitionsResponse {
  metafieldDefinitions: { nodes: Array<{ id: string }> };
}

interface MetafieldDefinitionCreateResponse {
  metafieldDefinitionCreate: {
    createdDefinition: { id: string; name: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

const FIND_EXISTING_METAFIELD_DEFINITION_QUERY = /* GraphQL */ `
  query FindVariantRetailPriceMetafieldDefinition($namespace: String!, $key: String!) {
    metafieldDefinitions(ownerType: PRODUCTVARIANT, namespace: $namespace, key: $key, first: 1) {
      nodes {
        id
      }
    }
  }
`;

// Run manually if METAFIELD_STOREFRONT_ACCESS needs verifying against the live schema:
//   query { __type(name: "MetafieldAccessInput") { inputFields { name type { name kind ofType { name } } } } }
//   query { __type(name: "MetafieldStorefrontAccess") { enumValues { name } } }
const CREATE_METAFIELD_DEFINITION_MUTATION = /* GraphQL */ `
  mutation CreateVariantRetailPriceMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function main() {
  console.log('Creating ProductVariant -> Retail Price metafield definition...\n');

  const existing = await shopifyAdminRequest<MetafieldDefinitionsResponse>(
    FIND_EXISTING_METAFIELD_DEFINITION_QUERY,
    { namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY }
  );
  if (existing.metafieldDefinitions.nodes.length > 0) {
    console.log(
      `  already exists, skipping: ProductVariant.${METAFIELD_NAMESPACE}.${METAFIELD_KEY} -> ${existing.metafieldDefinitions.nodes[0].id}`
    );
    return;
  }

  const data = await shopifyAdminRequest<MetafieldDefinitionCreateResponse>(
    CREATE_METAFIELD_DEFINITION_MUTATION,
    {
      definition: {
        name: 'Retail Price',
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
        type: 'money',
        ownerType: 'PRODUCTVARIANT',
        pin: true,
        access: { storefront: METAFIELD_STOREFRONT_ACCESS },
      },
    }
  );
  assertNoUserErrors(data.metafieldDefinitionCreate.userErrors, 'metafieldDefinitionCreate');

  const created = data.metafieldDefinitionCreate.createdDefinition;
  if (!created) {
    throw new Error('metafieldDefinitionCreate returned no definition and no userErrors');
  }
  console.log(`  created: ProductVariant.${METAFIELD_NAMESPACE}.${METAFIELD_KEY} -> ${created.id}`);
}

main().catch((error) => {
  console.error('\nFailed:', error instanceof Error ? error.message : error);
  if (error?.errors) console.error('Details:', JSON.stringify(error.errors, null, 2));
  process.exit(1);
});
