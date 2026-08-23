import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from '@/lib/shopify/admin-client';
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
// Create — researched 2026-08-23 (official Shopify docs): file_reference fields need a 3-step
// upload (stagedUploadsCreate -> upload -> fileCreate) before the resulting File GID can be used
// as a metaobjectCreate field value. See ADMIN_PANEL_IMPLEMENTATION.md's Taxonomy section for the
// full reasoning (fields array vs values JSON-object format, etc.)
// ---------------------------------------------------------------------------------------------

interface StagedUploadsCreateResponse {
  stagedUploadsCreate: {
    stagedTargets: Array<{
      url: string;
      resourceUrl: string;
      parameters: Array<{ name: string; value: string }>;
    }>;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

const STAGED_UPLOADS_CREATE_MUTATION = /* GraphQL */ `
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface FileCreateResponse {
  fileCreate: {
    files: Array<{ id: string; fileStatus: string }>;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

const FILE_CREATE_MUTATION = /* GraphQL */ `
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Uploads an image file to Shopify, returning a File GID usable as a file_reference value. */
async function uploadImageFile(file: File): Promise<string> {
  const stagedData = await shopifyAdminRequest<StagedUploadsCreateResponse>(
    STAGED_UPLOADS_CREATE_MUTATION,
    {
      input: [
        {
          filename: file.name,
          mimeType: file.type,
          httpMethod: 'POST',
          resource: 'IMAGE',
        },
      ],
    }
  );
  assertNoUserErrors(stagedData.stagedUploadsCreate.userErrors, 'stagedUploadsCreate');
  const target = stagedData.stagedUploadsCreate.stagedTargets[0];

  const uploadForm = new FormData();
  for (const param of target.parameters) {
    uploadForm.append(param.name, param.value);
  }
  uploadForm.append('file', file);
  const uploadResponse = await fetch(target.url, { method: 'POST', body: uploadForm });
  if (!uploadResponse.ok) {
    throw new Error(`Staged upload failed: ${uploadResponse.status}`);
  }

  const fileData = await shopifyAdminRequest<FileCreateResponse>(FILE_CREATE_MUTATION, {
    files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE' }],
  });
  assertNoUserErrors(fileData.fileCreate.userErrors, 'fileCreate');
  return fileData.fileCreate.files[0].id;
}

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
