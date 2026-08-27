import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from '@/lib/shopify/admin-client';
import { uploadImageFile } from '@/lib/shopify/upload-image';
import { requireAdmin } from './admin-auth';

export type TaxonomyEntry = {
  id: string;
  handle: string;
  name: string;
  parentId: string | null;
};

interface MetaobjectField {
  key: string;
  value: string | null;
  reference: { id: string } | null;
}

interface MetaobjectsResponse {
  metaobjects: {
    nodes: Array<{
      id: string;
      handle: string;
      fields: MetaobjectField[];
    }>;
  };
}

const METAOBJECTS_QUERY = /* GraphQL */ `
  query ListMetaobjects($type: String!) {
    metaobjects(type: $type, first: 250) {
      nodes {
        id
        handle
        fields {
          key
          value
          reference {
            ... on Metaobject {
              id
            }
          }
        }
      }
    }
  }
`;

function fieldValue(fields: MetaobjectField[], key: string): string | null {
  return fields.find((f) => f.key === key)?.value ?? null;
}

function fieldReferenceId(fields: MetaobjectField[], key: string): string | null {
  return fields.find((f) => f.key === key)?.reference?.id ?? null;
}

async function listMetaobjects(type: string, parentFieldKey?: string): Promise<TaxonomyEntry[]> {
  const data = await shopifyAdminRequest<MetaobjectsResponse>(METAOBJECTS_QUERY, { type });
  return data.metaobjects.nodes.map((node) => ({
    id: node.id,
    handle: node.handle,
    name: fieldValue(node.fields, 'name') ?? node.handle,
    parentId: parentFieldKey ? fieldReferenceId(node.fields, parentFieldKey) : null,
  }));
}

/** Category (top level, no parent). */
export async function listCategories(): Promise<TaxonomyEntry[]> {
  await requireAdmin();
  return listMetaobjects('category');
}

/** Sub-categories, optionally filtered to a single parent Category. */
export async function listSubcategories(categoryId?: string): Promise<TaxonomyEntry[]> {
  await requireAdmin();
  const all = await listMetaobjects('sub_category', 'category');
  return categoryId ? all.filter((s) => s.parentId === categoryId) : all;
}

/** Brands, optionally filtered to a single parent Sub-category. */
export async function listBrands(subcategoryId?: string): Promise<TaxonomyEntry[]> {
  await requireAdmin();
  const all = await listMetaobjects('brand', 'sub_category');
  return subcategoryId ? all.filter((b) => b.parentId === subcategoryId) : all;
}

// ---------------------------------------------------------------------------------------------
// Create — file_reference fields need a 3-step upload (stagedUploadsCreate -> upload ->
// fileCreate, see @/lib/shopify/upload-image) before the resulting File GID can be used as a
// metaobjectCreate field value.
// ---------------------------------------------------------------------------------------------

interface MetaobjectCreateResponse {
  metaobjectCreate: {
    metaobject: { id: string; handle: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

const METAOBJECT_CREATE_MUTATION = /* GraphQL */ `
  mutation MetaobjectCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function createMetaobjectEntry(
  type: string,
  fields: Array<{ key: string; value: string }>
): Promise<TaxonomyEntry> {
  const data = await shopifyAdminRequest<MetaobjectCreateResponse>(METAOBJECT_CREATE_MUTATION, {
    metaobject: { type, fields },
  });
  assertNoUserErrors(data.metaobjectCreate.userErrors, 'metaobjectCreate');
  const created = data.metaobjectCreate.metaobject;
  if (!created) throw new Error('metaobjectCreate returned no entry and no userErrors');

  return {
    id: created.id,
    handle: created.handle,
    name: fields.find((f) => f.key === 'name')?.value ?? created.handle,
    parentId: null,
  };
}

export async function createCategory(input: {
  name: string;
  description?: string;
  image?: File;
}): Promise<TaxonomyEntry> {
  await requireAdmin();
  const fields = [{ key: 'name', value: input.name }];
  if (input.description) fields.push({ key: 'description', value: input.description });
  if (input.image) fields.push({ key: 'image', value: await uploadImageFile(input.image) });
  return createMetaobjectEntry('category', fields);
}

export async function createSubcategory(input: {
  name: string;
  description?: string;
  image?: File;
  categoryId: string;
}): Promise<TaxonomyEntry> {
  await requireAdmin();
  const fields = [
    { key: 'name', value: input.name },
    { key: 'category', value: input.categoryId },
  ];
  if (input.description) fields.push({ key: 'description', value: input.description });
  if (input.image) fields.push({ key: 'image', value: await uploadImageFile(input.image) });
  return createMetaobjectEntry('sub_category', fields);
}

export async function createBrand(input: {
  name: string;
  description?: string;
  logo?: File;
  subcategoryId: string;
}): Promise<TaxonomyEntry> {
  await requireAdmin();
  const fields = [
    { key: 'name', value: input.name },
    { key: 'sub_category', value: input.subcategoryId },
  ];
  if (input.description) fields.push({ key: 'description', value: input.description });
  if (input.logo) fields.push({ key: 'logo', value: await uploadImageFile(input.logo) });
  return createMetaobjectEntry('brand', fields);
}
