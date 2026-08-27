import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const MUTATION = /* GraphQL */ `
  mutation($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id name }
      userErrors { field message }
    }
  }
`;

async function main() {
  const data = await shopifyAdminRequest<any>(MUTATION, {
    definition: {
      name: 'Test Nicotine Strength',
      namespace: 'custom',
      key: 'test_nicotine_strength',
      type: 'single_line_text_field',
      ownerType: 'PRODUCTVARIANT',
      validations: [{ name: 'choices', value: JSON.stringify(['0mg', '3mg', '6mg', '12mg']) }],
    },
  });
  assertNoUserErrors(data.metafieldDefinitionCreate.userErrors, 'create');
  console.log('created:', JSON.stringify(data.metafieldDefinitionCreate.createdDefinition, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
