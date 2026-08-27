/**
 * One-time backfill: existing products predate product_health_snapshot / variant_sku_index (004),
 * so the Dashboard's status/missing-image/missing-SKU/price-anomaly/duplicate-SKU/stale-draft/
 * brand-coverage widgets would show nothing for them until each is next edited (which is what
 * triggers the PRODUCTS_UPDATE webhook). This loops all products and populates both tables once,
 * reusing the exact same derivation logic as src/app/api/webhooks/products/route.ts.
 *
 * Run: npm run shopify:backfill-product-health-snapshot
 */
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

// Inlined rather than importing src/lib/shopify/product-webhook-queries.ts -- that file has its
// own `import 'server-only'`, which throws when loaded outside Next's webpack bundling (i.e. from
// a plain tsx script like this one). Standalone scripts always import admin-client.core directly
// and inline their own queries, per this project's existing convention (see register/unregister
// scripts) -- this is the same duplication trade-off, not an oversight.
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

async function getProductTaxonomyAndFilters(productId: string) {
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
    const linksData = await shopifyAdminRequest<any>(GET_SUBCATEGORY_RELEVANT_FILTERS_QUERY, { id: subcategoryId });
    const filterIds: string[] = linksData.metaobject?.field?.value ? JSON.parse(linksData.metaobject.field.value) : [];

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
        (p.metafields?.nodes ?? []).filter((f: any) => f.namespace === 'custom' && f.value).map((f: any) => f.key)
      );
      missingRequiredFilter = requiredKeys.some((key) => !customFieldKeys.has(key));
    }
  }

  return { brandId, brandName, subcategoryId, subcategoryName, missingRequiredFilter };
}

const LIST_QUERY = /* GraphQL */ `
  query ListAllProducts {
    products(first: 100) {
      nodes {
        id
        title
        status
        createdAt
        updatedAt
        publishedAt
        images(first: 1) {
          nodes {
            id
          }
        }
        variants(first: 250) {
          nodes {
            id
            sku
            price
            compareAtPrice
          }
        }
      }
    }
  }
`;

async function main() {
  const supabase = createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const data = await shopifyAdminRequest<any>(LIST_QUERY);
  const products = data.products.nodes;
  console.log(`Found ${products.length} products. Backfilling...`);

  let ok = 0;
  let failed = 0;

  for (const p of products) {
    const hasImage = p.images.nodes.length > 0;
    const variants = p.variants.nodes as Array<{ id: string; sku: string | null; price: string; compareAtPrice: string | null }>;
    const variantCount = variants.length;
    const missingSkuCount = variants.filter((v) => !v.sku || v.sku.trim() === '').length;
    const hasPriceAnomaly = variants.some((v) => {
      const price = parseFloat(v.price);
      const compareAt = v.compareAtPrice ? parseFloat(v.compareAtPrice) : null;
      return price === 0 || (compareAt !== null && compareAt < price);
    });

    const taxonomy = await getProductTaxonomyAndFilters(p.id);

    const { error } = await supabase.rpc('upsert_product_health_snapshot_if_newer', {
      p_product_id: p.id,
      p_title: p.title,
      p_status: p.status,
      p_has_image: hasImage,
      p_variant_count: variantCount,
      p_missing_sku_count: missingSkuCount,
      p_has_price_anomaly: hasPriceAnomaly,
      p_brand_id: taxonomy?.brandId ?? null,
      p_brand_name: taxonomy?.brandName ?? null,
      p_subcategory_id: taxonomy?.subcategoryId ?? null,
      p_subcategory_name: taxonomy?.subcategoryName ?? null,
      p_missing_required_filter: taxonomy?.missingRequiredFilter ?? false,
      p_created_at: p.createdAt,
      p_published_at: p.publishedAt,
      p_shopify_updated_at: p.updatedAt,
    });
    if (error) {
      console.error(`  failed: ${p.title}`, error.message);
      failed++;
      continue;
    }

    const skuRows = variants
      .filter((v) => v.sku && v.sku.trim() !== '')
      .map((v) => ({ variant_id: v.id, sku: v.sku }));
    const { error: skuError } = await supabase.rpc('replace_variant_sku_index_for_product', {
      p_product_id: p.id,
      p_variants: skuRows,
    });
    if (skuError) console.error(`  sku index failed: ${p.title}`, skuError.message);

    console.log(`  seeded: ${p.title}`);
    ok++;
  }

  console.log(`\nDone. Seeded ${ok}, failed ${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
