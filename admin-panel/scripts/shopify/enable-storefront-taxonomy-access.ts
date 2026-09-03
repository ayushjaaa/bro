/**
 * One-time setup script — grants public Storefront API read access to the taxonomy metaobject
 * definitions (category, sub_category, brand, filter_definition), which were created admin-only
 * by create-metaobject-definitions.ts / create-filter-definitions.ts. Until this runs, only the
 * admin panel (private Admin API token) can read them; the storefront has been using a hand-typed
 * placeholder copy (src/features/navigation/data.ts) instead of the real thing.
 *
 * Verified against Shopify's Admin GraphQL schema docs: MetaobjectDefinitionUpdateInput.access
 * is a MetaobjectAccessInput, whose `storefront` field takes MetaobjectStorefrontAccess
 * (NONE | PUBLIC_READ).
 *
 * Idempotent: re-running is a no-op for any definition already set to PUBLIC_READ.
 *
 * Run: npm run shopify:enable-storefront-taxonomy-access
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const TYPES = ['category', 'sub_category', 'brand', 'filter_definition'] as const;

interface DefinitionByTypeResponse {
  metaobjectDefinitionByType: {
    id: string;
    type: string;
    access: { storefront: string };
  } | null;
}

const GET_DEFINITION_QUERY = /* GraphQL */ `
  query GetMetaobjectDefinitionByType($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      type
      access {
        storefront
      }
    }
  }
`;

const UPDATE_DEFINITION_MUTATION = /* GraphQL */ `
  mutation UpdateMetaobjectDefinition($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition {
        id
        type
        access {
          storefront
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function main() {
  console.log('Granting Storefront API PUBLIC_READ access to taxonomy metaobject definitions...\n');

  for (const type of TYPES) {
    const existing = await shopifyAdminRequest<DefinitionByTypeResponse>(GET_DEFINITION_QUERY, { type });
    const definition = existing.metaobjectDefinitionByType;
    if (!definition) {
      console.log(`  SKIP (definition not found): ${type} — run the earlier setup script for it first`);
      continue;
    }

    if (definition.access.storefront === 'PUBLIC_READ') {
      console.log(`  already PUBLIC_READ, skipping: ${type}`);
      continue;
    }

    const data = await shopifyAdminRequest<any>(UPDATE_DEFINITION_MUTATION, {
      id: definition.id,
      definition: { access: { storefront: 'PUBLIC_READ' } },
    });
    assertNoUserErrors(data.metaobjectDefinitionUpdate.userErrors, `metaobjectDefinitionUpdate(${type}.access)`);
    console.log(`  updated: ${type} -> storefront access is now PUBLIC_READ`);
  }

  console.log('\nDone.');
}

main().catch((error) => {
  console.error('\nFailed:', error instanceof Error ? error.message : error);
  if (error?.errors) console.error('Details:', JSON.stringify(error.errors, null, 2));
  process.exit(1);
});
