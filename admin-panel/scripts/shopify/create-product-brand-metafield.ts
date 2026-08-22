/**
 * One-time setup script — creates a Product metafield definition ("Brand") so a Product Line
 * (DECISIONS.md item 1a/2: Product Line is now a real Shopify Product, not a metaobject) can
 * reference its Brand metaobject entry directly. Sub-category/Category are derived by walking up
 * the Brand -> Sub-category -> Category chain from there, not stored redundantly on the Product.
 *
 * Replaces the old create-product-line-metafield.ts (superseded 2026-08-22, DECISIONS.md item 2)
 * — that script linked a flavor-Product to a "Product Line" metaobject, which no longer exists
 * now that flavors are variants (item 1a) and Product Line is the Product itself.
 *
 * Idempotent: safe to re-run.
 *
 * Run: npm run shopify:create-product-brand-metafield
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const BRAND_METAOBJECT_TYPE = 'brand';
const METAFIELD_NAMESPACE = 'taxonomy';
const METAFIELD_KEY = 'brand';

interface MetaobjectDefinitionByTypeResponse {
  metaobjectDefinitionByType: { id: string } | null;
}

interface MetafieldDefinitionsResponse {
  metafieldDefinitions: { nodes: Array<{ id: string }> };
}

interface MetafieldDefinitionCreateResponse {
  metafieldDefinitionCreate: {
    createdDefinition: { id: string; name: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

const GET_DEFINITION_BY_TYPE_QUERY = /* GraphQL */ `
  query GetMetaobjectDefinitionByType($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
    }
  }
`;

const FIND_EXISTING_METAFIELD_DEFINITION_QUERY = /* GraphQL */ `
  query FindProductBrandMetafieldDefinition($namespace: String!, $key: String!) {
    metafieldDefinitions(ownerType: PRODUCT, namespace: $namespace, key: $key, first: 1) {
      nodes {
        id
      }
    }
  }
`;

const CREATE_METAFIELD_DEFINITION_MUTATION = /* GraphQL */ `
  mutation CreateProductBrandMetafieldDefinition($definition: MetafieldDefinitionInput!) {
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
  console.log('Creating Product -> Brand metafield definition...\n');

  const brandDef = await shopifyAdminRequest<MetaobjectDefinitionByTypeResponse>(
    GET_DEFINITION_BY_TYPE_QUERY,
    { type: BRAND_METAOBJECT_TYPE }
  );
  const brandDefinitionId = brandDef.metaobjectDefinitionByType?.id;
  if (!brandDefinitionId) {
    throw new Error(
      `Brand metaobject definition not found. Run "npm run shopify:create-metaobject-definitions" first.`
    );
  }

  const existing = await shopifyAdminRequest<MetafieldDefinitionsResponse>(
    FIND_EXISTING_METAFIELD_DEFINITION_QUERY,
    { namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY }
  );
  if (existing.metafieldDefinitions.nodes.length > 0) {
    console.log(
      `  already exists, skipping: Product.${METAFIELD_NAMESPACE}.${METAFIELD_KEY} -> ${existing.metafieldDefinitions.nodes[0].id}`
    );
    return;
  }

  const data = await shopifyAdminRequest<MetafieldDefinitionCreateResponse>(
    CREATE_METAFIELD_DEFINITION_MUTATION,
    {
      definition: {
        name: 'Brand',
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
        type: 'metaobject_reference',
        ownerType: 'PRODUCT',
        validations: [{ name: 'metaobject_definition_id', value: brandDefinitionId }],
        pin: true,
      },
    }
  );
  assertNoUserErrors(data.metafieldDefinitionCreate.userErrors, 'metafieldDefinitionCreate');

  const created = data.metafieldDefinitionCreate.createdDefinition;
  if (!created) {
    throw new Error('metafieldDefinitionCreate returned no definition and no userErrors');
  }
  console.log(`  created: Product.${METAFIELD_NAMESPACE}.${METAFIELD_KEY} -> ${created.id}`);
  console.log(
    '\nDone. "Brand" will now appear as a field when adding/editing a Product Line in Shopify Admin.'
  );
}

main().catch((error) => {
  console.error('\nFailed:', error instanceof Error ? error.message : error);
  if (error?.errors) console.error('Details:', JSON.stringify(error.errors, null, 2));
  process.exit(1);
});
