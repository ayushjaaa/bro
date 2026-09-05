/**
 * One-time setup script -- creates Product.custom.subcategory_name (single_line_text_field),
 * mirrored from Brand -> Sub-category (same pattern as custom.region), with:
 *   - capabilities.smartCollectionCondition enabled -- required for Smart Collection rules to
 *     use this field (PRODUCT_PAGE_PLAN.md §12.x Collection-scoping plan).
 *   - access.storefront: PUBLIC_READ -- so the storefront's own reads work too (not strictly
 *     needed once Collection-scoping is live, but harmless/consistent with custom.region).
 *
 * Idempotent: safe to re-run.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/create-product-subcategory-metafield.ts
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const NAMESPACE = 'custom';
const KEY = 'subcategory_name';

const FIND_QUERY = /* GraphQL */ `
  query Find($namespace: String!, $key: String!) {
    metafieldDefinitions(ownerType: PRODUCT, namespace: $namespace, key: $key, first: 1) {
      nodes { id }
    }
  }
`;

const CREATE_MUTATION = /* GraphQL */ `
  mutation Create($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id name }
      userErrors { field message }
    }
  }
`;

async function main() {
  const existing = await shopifyAdminRequest<any>(FIND_QUERY, { namespace: NAMESPACE, key: KEY });
  if (existing.metafieldDefinitions.nodes.length > 0) {
    console.log(`already exists, skipping: Product.${NAMESPACE}.${KEY} -> ${existing.metafieldDefinitions.nodes[0].id}`);
    return;
  }

  const data = await shopifyAdminRequest<any>(CREATE_MUTATION, {
    definition: {
      name: 'Sub-category Name',
      namespace: NAMESPACE,
      key: KEY,
      type: 'single_line_text_field',
      ownerType: 'PRODUCT',
      pin: true,
      access: { storefront: 'PUBLIC_READ' },
      capabilities: { smartCollectionCondition: { enabled: true } },
    },
  });
  assertNoUserErrors(data.metafieldDefinitionCreate.userErrors, 'metafieldDefinitionCreate');
  console.log('created:', data.metafieldDefinitionCreate.createdDefinition);
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  if ((err as any)?.errors) console.error('Details:', JSON.stringify((err as any).errors, null, 2));
  process.exit(1);
});
