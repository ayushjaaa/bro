/**
 * One-time setup script — creates a Variant metafield definition ("Region") so each flavour
 * variant can carry which excise-stamp region it's legally stocked for (DECISIONS.md item 42).
 *
 * Deliberately a plain single-line-text metafield, NOT a formal Shopify Option — this preserves
 * an Option slot on the product (only 3 allowed) for a possible future third dimension (e.g.
 * Nicotine Strength), per item 42's reasoning.
 *
 * Idempotent: safe to re-run.
 *
 * Run: npm run shopify:create-variant-region-metafield
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const METAFIELD_NAMESPACE = 'custom';
const METAFIELD_KEY = 'region';

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
  query FindVariantRegionMetafieldDefinition($namespace: String!, $key: String!) {
    metafieldDefinitions(ownerType: PRODUCTVARIANT, namespace: $namespace, key: $key, first: 1) {
      nodes {
        id
      }
    }
  }
`;

const CREATE_METAFIELD_DEFINITION_MUTATION = /* GraphQL */ `
  mutation CreateVariantRegionMetafieldDefinition($definition: MetafieldDefinitionInput!) {
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
  console.log('Creating ProductVariant -> Region metafield definition...\n');

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
        name: 'Region',
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
        type: 'single_line_text_field',
        ownerType: 'PRODUCTVARIANT',
        pin: true,
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
