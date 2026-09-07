/**
 * One-time setup script -- creates the 4 Collection-level metafields that drive the storefront's
 * live mega-menu (PRODUCT_PAGE_PLAN.md-adjacent mega-menu plan, 2026-09-07). These live on the
 * per-sub-category Collections created by createSubcategory() (src/data/taxonomy.ts) /
 * backfill-subcategory-collections.ts -- deliberately NOT a new metaobject type, since the
 * Collection itself is already the right place to say "this sub-category's products should show
 * up in the mega menu, under this group."
 *
 * Left blank on a Collection = that sub-category doesn't appear in the mega menu at all.
 *
 * All fields get access.storefront: PUBLIC_READ from creation (the exact gap the taxonomy plan's
 * §12.1 already hit once for Brand/Region metafields, set here up front instead of after the fact).
 *
 * Idempotent: safe to re-run.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/create-mega-menu-collection-metafields.ts
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const NAMESPACE = 'custom';

const DEFINITIONS: Array<{ key: string; name: string; type: string }> = [
  { key: 'menu_nav_key', name: 'Menu Nav Key', type: 'single_line_text_field' },
  { key: 'menu_group_label', name: 'Menu Group Label', type: 'single_line_text_field' },
  { key: 'menu_group_mode', name: 'Menu Group Mode', type: 'single_line_text_field' },
  { key: 'menu_sort_order', name: 'Menu Sort Order', type: 'number_integer' },
];

const FIND_QUERY = /* GraphQL */ `
  query Find($namespace: String!, $key: String!) {
    metafieldDefinitions(ownerType: COLLECTION, namespace: $namespace, key: $key, first: 1) {
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
  for (const def of DEFINITIONS) {
    const existing = await shopifyAdminRequest<any>(FIND_QUERY, { namespace: NAMESPACE, key: def.key });
    if (existing.metafieldDefinitions.nodes.length > 0) {
      console.log(`already exists, skipping: Collection.${NAMESPACE}.${def.key} -> ${existing.metafieldDefinitions.nodes[0].id}`);
      continue;
    }

    const data = await shopifyAdminRequest<any>(CREATE_MUTATION, {
      definition: {
        name: def.name,
        namespace: NAMESPACE,
        key: def.key,
        type: def.type,
        ownerType: 'COLLECTION',
        pin: true,
        access: { storefront: 'PUBLIC_READ' },
      },
    });
    assertNoUserErrors(data.metafieldDefinitionCreate.userErrors, 'metafieldDefinitionCreate');
    console.log('created:', data.metafieldDefinitionCreate.createdDefinition);
  }
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  if ((err as any)?.errors) console.error('Details:', JSON.stringify((err as any).errors, null, 2));
  process.exit(1);
});
