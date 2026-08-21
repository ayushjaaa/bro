/**
 * One-time setup script — creates a Product metafield definition ("Product Line") so a Shopify
 * Product (a flavor, DECISIONS.md item 1) can reference a Product Line metaobject entry. Without
 * this, the taxonomy chain (Category -> Sub-category -> Brand -> Product Line, item 2/3) has no
 * connection point on the Product resource itself, and "Product Line" won't appear as a field
 * when adding/editing a product in Shopify Admin.
 *
 * Idempotent: safe to re-run.
 *
 * Run: npm run shopify:create-product-line-metafield
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const PRODUCT_LINE_METAOBJECT_TYPE = 'product_line';
const METAFIELD_NAMESPACE = 'taxonomy';
const METAFIELD_KEY = 'product_line';

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
  query FindProductLineMetafieldDefinition($namespace: String!, $key: String!) {
    metafieldDefinitions(ownerType: PRODUCT, namespace: $namespace, key: $key, first: 1) {
      nodes {
        id
      }
    }
  }
`;

const CREATE_METAFIELD_DEFINITION_MUTATION = /* GraphQL */ `
  mutation CreateProductLineMetafieldDefinition($definition: MetafieldDefinitionInput!) {
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
  console.log('Creating Product -> Product Line metafield definition...\n');

  const productLineDef = await shopifyAdminRequest<MetaobjectDefinitionByTypeResponse>(
    GET_DEFINITION_BY_TYPE_QUERY,
    { type: PRODUCT_LINE_METAOBJECT_TYPE }
  );
  const productLineDefinitionId = productLineDef.metaobjectDefinitionByType?.id;
  if (!productLineDefinitionId) {
    throw new Error(
      `Product Line metaobject definition not found. Run "npm run shopify:create-metaobject-definitions" first.`
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
        name: 'Product Line',
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
        type: 'metaobject_reference',
        ownerType: 'PRODUCT',
        validations: [{ name: 'metaobject_definition_id', value: productLineDefinitionId }],
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
    '\nDone. "Product Line" will now appear as a field when adding/editing a Product in Shopify Admin.'
  );
}

main().catch((error) => {
  console.error('\nFailed:', error instanceof Error ? error.message : error);
  if (error?.errors) console.error('Details:', JSON.stringify(error.errors, null, 2));
  process.exit(1);
});
