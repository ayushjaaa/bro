import 'server-only';
import { shopifyAdminRequest } from '@/lib/shopify/admin-client';
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
