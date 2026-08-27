import 'server-only';
import { shopifyAdminRequest, ShopifyAdminApiError } from './admin-client';

/**
 * INTENTIONAL EXCEPTION to the src/data/*.ts convention: every function there calls
 * requireAdmin() first because it's driven by an authenticated admin's own request. This function
 * is different -- it's called from the products webhook route (src/app/api/webhooks/products/
 * route.ts), which has no admin session at all (Shopify's server is calling us, not our own
 * logged-in admin). Its trust boundary is HMAC verification (done by the route before this is
 * ever called), not a Supabase session -- so it deliberately does NOT call requireAdmin(), and
 * must never be wired into any requireAdmin()-gated caller either.
 *
 * Re-queries Shopify for the taxonomy chain and required-filter status of one product, rather
 * than trusting the webhook payload for this -- Shopify's REST-style product webhook payload does
 * not reliably include metafields by default (an opt-in `metafieldNamespaces` webhook setting
 * exists, but has open community-reported reliability complaints about namespaces silently not
 * coming through). Title/status/images/variant sku+price ARE reliably in the raw payload, so this
 * only covers the fields that aren't.
 *
 * "Missing required filter" is scoped to PRODUCT-level required filters only (not variant-level)
 * -- checking every variant of every product against required variant-level filters multiplies
 * complexity for a warning widget; product-level covers the common case.
 */
const GET_PRODUCT_TAXONOMY_QUERY = /* GraphQL */ `
  query GetProductTaxonomyAndFilters($id: ID!) {
    product(id: $id) {
      metafields(first: 50) {
        nodes {
          namespace
          key
          value
        }
      }
      brandField: metafield(namespace: "taxonomy", key: "brand") {
        reference {
          ... on Metaobject {
            id
            brandName: field(key: "name") {
              value
            }
            subCategoryField: field(key: "sub_category") {
              reference {
                ... on Metaobject {
                  id
                  subCategoryName: field(key: "name") {
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const GET_SUBCATEGORY_RELEVANT_FILTERS_QUERY = /* GraphQL */ `
  query GetSubcategoryRelevantFilters($id: ID!) {
    metaobject(id: $id) {
      field(key: "relevant_filters") {
        value
      }
    }
  }
`;

const GET_FILTER_DEFINITIONS_QUERY = /* GraphQL */ `
  query GetFilterDefinitions($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Metaobject {
        id
        fields {
          key
          value
        }
      }
    }
  }
`;

export type ProductTaxonomyAndFilters = {
  brandId: string | null;
  brandName: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
  missingRequiredFilter: boolean;
};

export async function getProductTaxonomyAndFilters(
  productId: string
): Promise<ProductTaxonomyAndFilters | null> {
  try {
    const data = await shopifyAdminRequest<any>(GET_PRODUCT_TAXONOMY_QUERY, { id: productId });
    const p = data.product;
    if (!p) return null;

    const brandRef = p.brandField?.reference;
    const subCategoryRef = brandRef?.subCategoryField?.reference;
    const brandId: string | null = brandRef?.id ?? null;
    const brandName: string | null = brandRef?.brandName?.value ?? null;
    const subcategoryId: string | null = subCategoryRef?.id ?? null;
    const subcategoryName: string | null = subCategoryRef?.subCategoryName?.value ?? null;

    let missingRequiredFilter = false;
    if (subcategoryId) {
      const linksData = await shopifyAdminRequest<any>(GET_SUBCATEGORY_RELEVANT_FILTERS_QUERY, {
        id: subcategoryId,
      });
      const filterIds: string[] = linksData.metaobject?.field?.value
        ? JSON.parse(linksData.metaobject.field.value)
        : [];

      if (filterIds.length > 0) {
        const defsData = await shopifyAdminRequest<any>(GET_FILTER_DEFINITIONS_QUERY, { ids: filterIds });
        const requiredKeys: string[] = (defsData.nodes ?? [])
          .filter((n: any) => n?.fields)
          .filter((n: any) => {
            const level = n.fields.find((f: any) => f.key === 'level')?.value;
            const required = n.fields.find((f: any) => f.key === 'required')?.value;
            return level === 'product' && required === 'true';
          })
          .map((n: any) => n.fields.find((f: any) => f.key === 'key')?.value)
          .filter(Boolean);

        const customFieldKeys = new Set(
          (p.metafields?.nodes ?? [])
            .filter((f: any) => f.namespace === 'custom' && f.value)
            .map((f: any) => f.key)
        );
        missingRequiredFilter = requiredKeys.some((key) => !customFieldKeys.has(key));
      }
    }

    return { brandId, brandName, subcategoryId, subcategoryName, missingRequiredFilter };
  } catch (err) {
    console.error(
      '[product-webhook] Shopify taxonomy re-query failed:',
      err instanceof ShopifyAdminApiError ? err.errors : err
    );
    return null; // caller must treat null as "skip taxonomy fields for this update", not as empty/none
  }
}
