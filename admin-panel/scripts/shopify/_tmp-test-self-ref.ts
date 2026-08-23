import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const CREATE_DEF = /* GraphQL */ `
  mutation($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { id type }
      userErrors { field message }
    }
  }
`;

const UPDATE_DEF = /* GraphQL */ `
  mutation($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition { id type fieldDefinitions { key type { name } } }
      userErrors { field message }
    }
  }
`;

async function main() {
  // Step 1: create a plain test type, no self-reference yet
  const createData = await shopifyAdminRequest<any>(CREATE_DEF, {
    definition: {
      name: 'Test Taxonomy Node',
      type: 'test_taxonomy_node',
      fieldDefinitions: [
        { key: 'name', name: 'Name', type: 'single_line_text_field' },
      ],
    },
  });
  assertNoUserErrors(createData.metaobjectDefinitionCreate.userErrors, 'create');
  const defId = createData.metaobjectDefinitionCreate.metaobjectDefinition.id;
  console.log('created definition:', defId);

  // Step 2: update it to add a field that references ITSELF
  const updateData = await shopifyAdminRequest<any>(UPDATE_DEF, {
    id: defId,
    definition: {
      fieldDefinitions: [
        {
          create: {
            key: 'parent',
            name: 'Parent',
            type: 'metaobject_reference',
            validations: [{ name: 'metaobject_definition_id', value: defId }],
          },
        },
      ],
    },
  });
  console.log('update userErrors:', JSON.stringify(updateData.metaobjectDefinitionUpdate.userErrors, null, 2));
  console.log('fields:', JSON.stringify(updateData.metaobjectDefinitionUpdate.metaobjectDefinition?.fieldDefinitions, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
