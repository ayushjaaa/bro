/**
 * Marks a FilterDefinition as required (or not) -- powers the Dashboard's "missing required
 * filter" warning. No admin-UI toggle exists for this yet (deliberate, out of scope for the
 * Live Dashboard Stats pass); this script is the escape hatch until one is built.
 *
 * Run: npm run shopify:set-filter-required -- <filter-key> true
 *      npm run shopify:set-filter-required -- <filter-key> false
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const LIST_QUERY = /* GraphQL */ `
  query ListFilterDefinitions {
    metaobjects(type: "filter_definition", first: 250) {
      nodes {
        id
        fields {
          key
          value
        }
      }
    }
  }
`;

const UPDATE_MUTATION = /* GraphQL */ `
  mutation MetaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function main() {
  const key = process.argv[2];
  const value = process.argv[3];

  if (!key || (value !== 'true' && value !== 'false')) {
    throw new Error('Usage: npm run shopify:set-filter-required -- <filter-key> <true|false>');
  }

  const data = await shopifyAdminRequest<any>(LIST_QUERY);
  const nodes = data.metaobjects.nodes as Array<{ id: string; fields: Array<{ key: string; value: string | null }> }>;
  const match = nodes.find((n) => n.fields.find((f) => f.key === 'key')?.value === key);

  if (!match) {
    console.log('Available filter keys:', nodes.map((n) => n.fields.find((f) => f.key === 'key')?.value).join(', '));
    throw new Error(`No filter_definition found with key "${key}"`);
  }

  const upd = await shopifyAdminRequest<any>(UPDATE_MUTATION, {
    id: match.id,
    metaobject: { fields: [{ key: 'required', value }] },
  });
  assertNoUserErrors(upd.metaobjectUpdate.userErrors, `metaobjectUpdate(filter_definition.${key}.required)`);
  console.log(`Set required=${value} for filter "${key}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
