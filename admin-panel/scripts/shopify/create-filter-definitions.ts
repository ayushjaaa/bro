/**
 * One-time setup script — creates the `filter_definition` metaobject type (§7.1 of
 * ADMIN_PANEL_IMPLEMENTATION.md) and adds the `relevant_filters` list.metaobject_reference field
 * to the existing `sub_category` definition so each Sub-category can point at the
 * filter_definitions relevant to it.
 *
 * Idempotent: skips filter_definition if it already exists; skips adding relevant_filters if the
 * sub_category definition already has that field.
 *
 * Run: npm run shopify:create-filter-definitions
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

interface FieldDef {
  key: string;
  name: string;
  type: string;
  required?: boolean;
  validations?: Array<{ name: string; value: string }>;
}

interface DefinitionByTypeResponse {
  metaobjectDefinitionByType: { id: string; name: string; type: string; fieldDefinitions: Array<{ key: string }> } | null;
}

const GET_DEFINITION_BY_TYPE_QUERY = /* GraphQL */ `
  query GetMetaobjectDefinitionByType($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      name
      type
      fieldDefinitions { key }
    }
  }
`;

const CREATE_DEFINITION_MUTATION = /* GraphQL */ `
  mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { id name type }
      userErrors { field message }
    }
  }
`;

const UPDATE_DEFINITION_MUTATION = /* GraphQL */ `
  mutation UpdateMetaobjectDefinition($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition { id }
      userErrors { field message }
    }
  }
`;

async function getDefinitionByType(type: string) {
  const data = await shopifyAdminRequest<DefinitionByTypeResponse>(GET_DEFINITION_BY_TYPE_QUERY, { type });
  return data.metaobjectDefinitionByType;
}

async function createFilterDefinitionType(): Promise<string> {
  const existing = await getDefinitionByType('filter_definition');
  if (existing) {
    console.log(`  already exists, skipping: filter_definition -> ${existing.id}`);
    return existing.id;
  }

  const fieldDefinitions: FieldDef[] = [
    { key: 'label', name: 'Label', type: 'single_line_text_field', required: true },
    { key: 'key', name: 'Key', type: 'single_line_text_field', required: true },
    {
      key: 'level',
      name: 'Level',
      type: 'single_line_text_field',
      required: true,
      validations: [{ name: 'choices', value: JSON.stringify(['native', 'product', 'variant']) }],
    },
    { key: 'choices', name: 'Choices', type: 'list.single_line_text_field' },
    {
      key: 'native_field',
      name: 'Native field',
      type: 'single_line_text_field',
      validations: [{ name: 'choices', value: JSON.stringify(['price', 'availability', 'brand', 'flavor']) }],
    },
  ];

  const data = await shopifyAdminRequest<any>(CREATE_DEFINITION_MUTATION, {
    definition: { name: 'Filter definition', type: 'filter_definition', fieldDefinitions },
  });
  assertNoUserErrors(data.metaobjectDefinitionCreate.userErrors, 'metaobjectDefinitionCreate(filter_definition)');
  const created = data.metaobjectDefinitionCreate.metaobjectDefinition;
  console.log(`  created: filter_definition -> ${created.id}`);
  return created.id;
}

async function addRelevantFiltersToSubCategory(filterDefinitionId: string) {
  const subCategory = await getDefinitionByType('sub_category');
  if (!subCategory) {
    throw new Error('sub_category metaobject definition not found -- run shopify:create-metaobject-definitions first');
  }
  if (subCategory.fieldDefinitions.some((f) => f.key === 'relevant_filters')) {
    console.log('  already exists, skipping: sub_category.relevant_filters');
    return;
  }

  const data = await shopifyAdminRequest<any>(UPDATE_DEFINITION_MUTATION, {
    id: subCategory.id,
    definition: {
      fieldDefinitions: [
        {
          create: {
            key: 'relevant_filters',
            name: 'Relevant filters',
            type: 'list.metaobject_reference',
            validations: [{ name: 'metaobject_definition_id', value: filterDefinitionId }],
          },
        },
      ],
    },
  });
  assertNoUserErrors(data.metaobjectDefinitionUpdate.userErrors, 'metaobjectDefinitionUpdate(sub_category.relevant_filters)');
  console.log('  added: sub_category.relevant_filters');
}

/** Adds the `required` boolean field to filter_definition -- for the Dashboard's "missing
 * required filter" warning (Live Dashboard Stats plan). Added after the type may already exist
 * from an earlier run, so this is a separate idempotent step, same "add field to existing
 * definition" pattern as addRelevantFiltersToSubCategory. Existing filter_definition records
 * default this field to unset/false (Shopify metaobject boolean fields with no explicit value
 * read back as null, treated as false by src/data/filters.ts) -- nothing is required until the
 * admin explicitly marks it so via `npm run shopify:set-filter-required`. */
async function addRequiredFieldToFilterDefinition(filterDefinitionId: string) {
  const definition = await getDefinitionByType('filter_definition');
  if (!definition) throw new Error('filter_definition metaobject definition not found');
  if (definition.fieldDefinitions.some((f) => f.key === 'required')) {
    console.log('  already exists, skipping: filter_definition.required');
    return;
  }

  const data = await shopifyAdminRequest<any>(UPDATE_DEFINITION_MUTATION, {
    id: filterDefinitionId,
    definition: {
      fieldDefinitions: [
        {
          create: {
            key: 'required',
            name: 'Required',
            type: 'boolean',
          },
        },
      ],
    },
  });
  assertNoUserErrors(data.metaobjectDefinitionUpdate.userErrors, 'metaobjectDefinitionUpdate(filter_definition.required)');
  console.log('  added: filter_definition.required');
}

async function main() {
  console.log('Creating filter_definition metaobject type...');
  const filterDefinitionId = await createFilterDefinitionType();

  console.log('\nAdding relevant_filters field to sub_category...');
  await addRelevantFiltersToSubCategory(filterDefinitionId);

  console.log('\nAdding required field to filter_definition...');
  await addRequiredFieldToFilterDefinition(filterDefinitionId);

  console.log('\nDone.');
}

main().catch((error) => {
  console.error('\nFailed:', error instanceof Error ? error.message : error);
  if (error?.errors) console.error('Details:', JSON.stringify(error.errors, null, 2));
  process.exit(1);
});
