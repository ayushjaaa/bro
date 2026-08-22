/**
 * One-time setup script (DECISIONS.md item 3: definitions are a "one-time setup (developer)"
 * task, unlike entries which are "ongoing, no-developer-needed"). Creates the 3 taxonomy
 * metaobject definitions — Category -> Sub-category -> Brand — each referencing only the level
 * directly above it (DECISIONS.md item 2/3).
 *
 * Product Line is NOT created here (updated 2026-08-22, DECISIONS.md item 2/1a): Product Line is
 * now a real Shopify Product, not a metaobject — see create-product-brand-metafield.ts for how a
 * Product Line product references Brand directly.
 *
 * Idempotent: safe to re-run. Skips any type that already exists and reuses its id for
 * downstream reference wiring.
 *
 * Run: npm run shopify:create-metaobject-definitions
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

interface MetaobjectDefinitionCreateResponse {
  metaobjectDefinitionCreate: {
    metaobjectDefinition: { id: string; name: string; type: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

interface MetaobjectDefinitionByTypeResponse {
  metaobjectDefinitionByType: { id: string; name: string; type: string } | null;
}

const CREATE_DEFINITION_MUTATION = /* GraphQL */ `
  mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
        name
        type
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_DEFINITION_BY_TYPE_QUERY = /* GraphQL */ `
  query GetMetaobjectDefinitionByType($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      name
      type
    }
  }
`;

type FieldDef = {
  key: string;
  name: string;
  type: string;
  required?: boolean;
  validations?: Array<{ name: string; value: string }>;
};

/** Builds the field list for a taxonomy level, optionally referencing the level above it. */
function buildFields(opts: {
  imageFieldKey: 'image' | 'logo';
  imageFieldName: 'Image' | 'Logo';
  referenceTo?: { key: string; name: string; definitionId: string };
}): FieldDef[] {
  const fields: FieldDef[] = [
    { key: 'name', name: 'Name', type: 'single_line_text_field', required: true },
    { key: 'description', name: 'Description', type: 'multi_line_text_field' },
    { key: opts.imageFieldKey, name: opts.imageFieldName, type: 'file_reference' },
  ];
  if (opts.referenceTo) {
    fields.push({
      key: opts.referenceTo.key,
      name: opts.referenceTo.name,
      type: 'metaobject_reference',
      required: true,
      validations: [{ name: 'metaobject_definition_id', value: opts.referenceTo.definitionId }],
    });
  }
  return fields;
}

async function findExistingDefinitionId(type: string): Promise<string | null> {
  const data = await shopifyAdminRequest<MetaobjectDefinitionByTypeResponse>(
    GET_DEFINITION_BY_TYPE_QUERY,
    { type }
  );
  return data.metaobjectDefinitionByType?.id ?? null;
}

async function createDefinition(
  name: string,
  type: string,
  fieldDefinitions: FieldDef[]
): Promise<string> {
  const existingId = await findExistingDefinitionId(type);
  if (existingId) {
    console.log(`  already exists, skipping: ${name} (${type}) -> ${existingId}`);
    return existingId;
  }

  const data = await shopifyAdminRequest<MetaobjectDefinitionCreateResponse>(
    CREATE_DEFINITION_MUTATION,
    { definition: { name, type, fieldDefinitions } }
  );
  assertNoUserErrors(data.metaobjectDefinitionCreate.userErrors, 'metaobjectDefinitionCreate');

  const created = data.metaobjectDefinitionCreate.metaobjectDefinition;
  if (!created) {
    throw new Error(`metaobjectDefinitionCreate for "${type}" returned no definition and no userErrors`);
  }
  console.log(`  created: ${name} (${type}) -> ${created.id}`);
  return created.id;
}

async function main() {
  console.log('Creating taxonomy metaobject definitions (Category -> Sub-category -> Brand)...\n');

  console.log('Category:');
  const categoryId = await createDefinition('Category', 'category', buildFields({
    imageFieldKey: 'image',
    imageFieldName: 'Image',
  }));

  console.log('Sub-category:');
  const subCategoryId = await createDefinition('Sub-category', 'sub_category', buildFields({
    imageFieldKey: 'image',
    imageFieldName: 'Image',
    referenceTo: { key: 'category', name: 'Category', definitionId: categoryId },
  }));

  console.log('Brand:');
  const brandId = await createDefinition('Brand', 'brand', buildFields({
    imageFieldKey: 'logo',
    imageFieldName: 'Logo',
    referenceTo: { key: 'sub_category', name: 'Sub-category', definitionId: subCategoryId },
  }));

  console.log('\nSummary (type -> definition GID):');
  console.table({
    category: { id: categoryId },
    sub_category: { id: subCategoryId },
    brand: { id: brandId },
  });
}

main().catch((error) => {
  console.error('\nFailed:', error instanceof Error ? error.message : error);
  if (error?.errors) console.error('Details:', JSON.stringify(error.errors, null, 2));
  process.exit(1);
});
