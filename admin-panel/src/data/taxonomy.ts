import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from '@/lib/shopify/admin-client';
import { uploadImageFile } from '@/lib/shopify/upload-image';
import { requireAdmin } from './admin-auth';
import { createSubcategoryCollection, setMegaMenuMetafields } from '@/lib/shopify/collection-helpers.core';
import { validateTaxonomyEntryInput } from '@/lib/taxonomy-input';
import { SafeActionError } from '@/lib/action-errors';

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
  const invalid = validateTaxonomyEntryInput(input);
  if (invalid) throw new SafeActionError(invalid);
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
  /** Optional mega-menu placement, set on the auto-created Collection right away instead of
   * requiring a separate trip to Shopify Admin (2026-09-07). All 4 optional -- omitting them
   * preserves the original behavior exactly: Collection created, not opted into the mega menu. */
  menuNavKey?: string;
  menuGroupLabel?: string;
  menuGroupMode?: string;
  menuSortOrder?: number;
}): Promise<TaxonomyEntry> {
  await requireAdmin();
  const invalid = validateTaxonomyEntryInput(input);
  if (invalid) throw new SafeActionError(invalid);
  const fields = [
    { key: 'name', value: input.name },
    { key: 'category', value: input.categoryId },
  ];
  if (input.description) fields.push({ key: 'description', value: input.description });
  if (input.image) fields.push({ key: 'image', value: await uploadImageFile(input.image) });
  const entry = await createMetaobjectEntry('sub_category', fields);

  // Mega-menu plan (2026-09-07): every Sub-category gets a matching Collection so the
  // storefront's live mega-menu (and any future Collection-based feature) can read real
  // products for it via product_type, without a Collection ever needing to be created by hand.
  // Deliberately never thrown -- a Collection hiccup must never break Sub-category creation,
  // which other flows already depend on completing. `backfill-subcategory-collections.ts`
  // covers any Sub-category this ever fails for (idempotent, safe to re-run).
  try {
    const collectionId = await createSubcategoryCollection(input.name);

    // Same never-throw reasoning as the Collection creation above, kept as its own try/catch so
    // a metafields hiccup can't be mistaken for (or mask) a Collection-creation failure in logs.
    if (input.menuNavKey || input.menuGroupLabel || input.menuGroupMode || input.menuSortOrder !== undefined) {
      try {
        await setMegaMenuMetafields(collectionId, {
          navKey: input.menuNavKey,
          groupLabel: input.menuGroupLabel,
          groupMode: input.menuGroupMode,
          sortOrder: input.menuSortOrder,
        });
      } catch (err) {
        console.error(`createSubcategory: failed to set mega-menu metafields for "${input.name}" -- continuing anyway.`, err);
      }
    }
  } catch (err) {
    console.error(`createSubcategory: failed to auto-create Collection for "${input.name}" -- continuing anyway.`, err);
  }

  return entry;
}

export async function createBrand(input: {
  name: string;
  description?: string;
  logo?: File;
  subcategoryId: string;
}): Promise<TaxonomyEntry> {
  await requireAdmin();
  const invalid = validateTaxonomyEntryInput(input);
  if (invalid) throw new SafeActionError(invalid);
  const fields = [
    { key: 'name', value: input.name },
    { key: 'sub_category', value: input.subcategoryId },
  ];
  if (input.description) fields.push({ key: 'description', value: input.description });
  if (input.logo) fields.push({ key: 'logo', value: await uploadImageFile(input.logo) });
  return createMetaobjectEntry('brand', fields);
}
