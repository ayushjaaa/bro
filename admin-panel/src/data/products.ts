import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from '@/lib/shopify/admin-client';
import { uploadImageForProductMedia } from '@/lib/shopify/upload-image';
import { requireAdmin } from './admin-auth';
import { INVENTORY_LOCATION_ID } from '@/lib/inventory';

/**
 * Product Line DAL (Flow B2, ADMIN_PANEL_IMPLEMENTATION.md §5 Flow B2 / §3 route map). A Product
 * Line is a real Shopify Product (not a metaobject) -- it references its Brand via the
 * `taxonomy.brand` metafield (see scripts/shopify/create-product-brand-metafield.ts); Sub-category
 * and Category are derived by walking Brand -> Sub-category -> Category, not stored redundantly.
 *
 * Created UNPUBLISHED (Shopify default) -- deliberately no `publishablePublish` call here yet;
 * a Product Line with 0 variants/flavours is a real incomplete state (Section 0a) and shouldn't
 * go live until flavours are added via the Bulk Variant Upload flow.
 */

const PRODUCT_CREATE_MUTATION = /* GraphQL */ `
  mutation ProductCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export type ProductLineSummary = {
  id: string;
  title: string;
  status: string;
  imageUrl: string | null;
  variantCount: number;
  brandName: string | null;
  subcategoryName: string | null;
  categoryName: string | null;
  /** Which region this Product Line represents (PRODUCT_PAGE_PLAN.md §11 -- one region per
   * Product Line now, not per-variant). Null only for pre-migration data that hasn't had
   * `custom.region` set yet. */
  region: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  totalInventory: number;
  minPrice: string;
  maxPrice: string;
  currencyCode: string;
  /** Per-variant inventory item id + quantity + title, so the /products list can show a
   * live-updating Stock total the same way the detail page does (LiveTotalStock) -- totalInventory
   * alone can't be patched incrementally from a single-item webhook update without this
   * breakdown -- and so the Dashboard's Out-of-Stock/Low-Stock widgets can name which Flavour. */
  variantStock: Array<{ inventoryItemId: string | null; quantity: number; title: string }>;
};

const LIST_PRODUCT_LINES_QUERY = /* GraphQL */ `
  query ListProductLines {
    products(first: 100, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        status
        createdAt
        updatedAt
        publishedAt
        totalInventory
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        featuredImage {
          url
        }
        variantsCount {
          count
        }
        variants(first: 250) {
          nodes {
            inventoryQuantity
            inventoryItem {
              id
            }
          }
        }
        regionField: metafield(namespace: "custom", key: "region") {
          value
        }
        metafield(namespace: "taxonomy", key: "brand") {
          reference {
            ... on Metaobject {
              brandName: field(key: "name") {
                value
              }
              subCategoryField: field(key: "sub_category") {
                reference {
                  ... on Metaobject {
                    subCategoryName: field(key: "name") {
                      value
                    }
                    categoryField: field(key: "category") {
                      reference {
                        ... on Metaobject {
                          categoryName: field(key: "name") {
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
        }
      }
    }
  }
`;

/** Lists Product Lines for the /products page -- newest-updated first. Flags Product Lines with
 * 0 variants as an incomplete state (§0a), not fetched separately: variantsCount comes back on
 * the same query. */
export async function listProductLines(): Promise<ProductLineSummary[]> {
  await requireAdmin();
  const data = await shopifyAdminRequest<any>(LIST_PRODUCT_LINES_QUERY);
  return data.products.nodes.map((n: any) => {
    const brandRef = n.metafield?.reference;
    const subCategoryRef = brandRef?.subCategoryField?.reference;
    return {
      id: n.id,
      title: n.title,
      status: n.status,
      imageUrl: n.featuredImage?.url ?? null,
      variantCount: n.variantsCount?.count ?? 0,
      brandName: brandRef?.brandName?.value ?? null,
      subcategoryName: subCategoryRef?.subCategoryName?.value ?? null,
      categoryName: subCategoryRef?.categoryField?.reference?.categoryName?.value ?? null,
      region: n.regionField?.value ?? null,
      isPublished: n.publishedAt !== null,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      totalInventory: n.totalInventory ?? 0,
      minPrice: n.priceRangeV2?.minVariantPrice?.amount ?? '0.0',
      maxPrice: n.priceRangeV2?.maxVariantPrice?.amount ?? '0.0',
      currencyCode: n.priceRangeV2?.minVariantPrice?.currencyCode ?? 'USD',
      variantStock: (n.variants?.nodes ?? []).map((v: any) => ({
        inventoryItemId: v.inventoryItem?.id ?? null,
        quantity: v.inventoryQuantity ?? 0,
      })),
    };
  });
}

export type ProductLineDetail = {
  id: string;
  title: string;
  descriptionHtml: string;
  status: string;
  imageUrl: string | null;
  images: string[];
  categoryName: string | null;
  subcategoryName: string | null;
  brandName: string | null;
  /** Which region this Product Line represents (PRODUCT_PAGE_PLAN.md §11) -- product-level now,
   * not per-variant. Null only for pre-migration data. */
  region: string | null;
  customFields: Array<{ key: string; value: string }>;
  variants: Array<{
    id: string;
    title: string;
    price: string;
    compareAtPrice: string | null;
    sku: string | null;
    quantity: number;
    inventoryItemId: string | null;
    isActivatedAtLocation: boolean;
    imageUrl: string | null;
    flavourDescription: string | null;
  }>;
  variantCount: number;
  isPublished: boolean;
  onlineStorePreviewUrl: string | null;
  createdAt: string;
  updatedAt: string;
  totalInventory: number;
  minPrice: string;
  maxPrice: string;
  currencyCode: string;
};

const GET_PRODUCT_LINE_QUERY = /* GraphQL */ `
  query GetProductLine($id: ID!) {
    product(id: $id) {
      id
      title
      descriptionHtml
      status
      createdAt
      updatedAt
      publishedAt
      onlineStorePreviewUrl
      totalInventory
      priceRangeV2 {
        minVariantPrice {
          amount
          currencyCode
        }
        maxVariantPrice {
          amount
        }
      }
      featuredImage {
        url
      }
      images(first: 8) {
        nodes {
          url
        }
      }
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
            brandName: field(key: "name") {
              value
            }
            subCategoryField: field(key: "sub_category") {
              reference {
                ... on Metaobject {
                  subCategoryName: field(key: "name") {
                    value
                  }
                  categoryField: field(key: "category") {
                    reference {
                      ... on Metaobject {
                        categoryName: field(key: "name") {
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
      }
      variantsCount {
        count
      }
      variants(first: 250) {
        nodes {
          id
          title
          price
          compareAtPrice
          sku
          inventoryQuantity
          inventoryItem {
            id
            inventoryLevels(first: 5) {
              nodes {
                location {
                  id
                }
              }
            }
          }
          image {
            url
          }
          metafields(first: 5) {
            nodes {
              namespace
              key
              value
            }
          }
        }
      }
    }
  }
`;

/** Full detail fetch for the Product Line detail page -- title, image(s), the Category/
 * Sub-category/Brand chain (walked via the taxonomy.brand metafield reference), every custom.*
 * filter value actually set on the product, and its flavours (variants) with Region/Description. */
export async function getProductLine(id: string): Promise<ProductLineDetail | null> {
  await requireAdmin();
  const data = await shopifyAdminRequest<any>(GET_PRODUCT_LINE_QUERY, { id });
  const p = data.product;
  if (!p) return null;

  const brandRef = p.brandField?.reference;
  const subCategoryRef = brandRef?.subCategoryField?.reference;

  const allCustomFields = (p.metafields?.nodes ?? []).filter((f: any) => f.namespace === 'custom');
  // Region is shown as its own dedicated field (below), not mixed into the generic filter-values
  // grid -- it's structural (which Product Line this is), not a product attribute filter.
  const region = allCustomFields.find((f: any) => f.key === 'region')?.value ?? null;
  const customFields = allCustomFields
    .filter((f: any) => f.key !== 'region')
    .map((f: any) => ({ key: f.key, value: f.value }));

  return {
    id: p.id,
    title: p.title,
    descriptionHtml: p.descriptionHtml ?? '',
    status: p.status,
    imageUrl: p.featuredImage?.url ?? null,
    images: (p.images?.nodes ?? []).map((n: any) => n.url),
    categoryName: subCategoryRef?.categoryField?.reference?.categoryName?.value ?? null,
    subcategoryName: subCategoryRef?.subCategoryName?.value ?? null,
    brandName: brandRef?.brandName?.value ?? null,
    region,
    customFields,
    variantCount: p.variantsCount?.count ?? 0,
    isPublished: p.publishedAt !== null,
    onlineStorePreviewUrl: p.onlineStorePreviewUrl ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    totalInventory: p.totalInventory ?? 0,
    minPrice: p.priceRangeV2?.minVariantPrice?.amount ?? '0.0',
    maxPrice: p.priceRangeV2?.maxVariantPrice?.amount ?? '0.0',
    currencyCode: p.priceRangeV2?.minVariantPrice?.currencyCode ?? 'USD',
    variants: (p.variants?.nodes ?? []).map((v: any) => {
      const vFields = v.metafields?.nodes ?? [];
      const flavourDescription =
        vFields.find((f: any) => f.namespace === 'custom' && f.key === 'flavour_description')?.value ?? null;
      return {
        id: v.id,
        title: v.title,
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        sku: v.sku ?? null,
        quantity: v.inventoryQuantity ?? 0,
        inventoryItemId: v.inventoryItem?.id ?? null,
        isActivatedAtLocation: (v.inventoryItem?.inventoryLevels?.nodes ?? []).some(
          (lvl: any) => lvl.location?.id === INVENTORY_LOCATION_ID
        ),
        imageUrl: v.image?.url ?? null,
        flavourDescription,
      };
    }),
  };
}

/** Region-suffixed title for a given region-clone (PRODUCT_PAGE_PLAN.md §11.3) -- e.g.
 * "Gcore E-Juice" + "federal" -> "Gcore E-Juice — Federal". Shared between createProductLine and
 * anywhere else that needs to derive/display the same naming convention. */
export function regionSuffixedTitle(baseTitle: string, regionLabel: string): string {
  return `${baseTitle} — ${regionLabel}`;
}

/**
 * Creates one Shopify Product **per region** in `input.regions` (PRODUCT_PAGE_PLAN.md §11.3's
 * "region checkboxes + auto-clone" flow) -- each clone shares the same Brand/filter metafields and
 * gets its own region-suffixed title plus a `custom.region` metafield. Region is a plain
 * product-level field now (like every other filter, §9), not a variant-level concern -- a single
 * Product Line only ever represents one region, so its Flavours (variants) never need the old
 * region-suffix naming hack (see data/variants.ts).
 */
export async function createProductLine(input: {
  title: string;
  brandId: string;
  filterValues: Record<string, string>;
  regions: Array<{ value: string; label: string }>;
  image?: File;
}): Promise<Array<{ id: string; title: string; region: string }>> {
  await requireAdmin();

  if (input.regions.length === 0) {
    throw new Error('At least one region must be selected for a Product Line.');
  }

  const media = input.image
    ? [{ originalSource: await uploadImageForProductMedia(input.image), mediaContentType: 'IMAGE' }]
    : undefined;

  const created: Array<{ id: string; title: string; region: string }> = [];

  // Sequential, not Promise.all -- keeps error attribution simple (which region failed) and
  // avoids uploading input.image's file data more than once concurrently for no benefit (Shopify
  // media upload is the slow step here, not worth parallelizing for a handful of regions).
  for (const region of input.regions) {
    const title = regionSuffixedTitle(input.title, region.label);
    const metafields: Array<{ namespace: string; key: string; type: string; value: string }> = [
      { namespace: 'taxonomy', key: 'brand', type: 'metaobject_reference', value: input.brandId },
      { namespace: 'custom', key: 'region', type: 'single_line_text_field', value: region.value },
    ];
    for (const [key, value] of Object.entries(input.filterValues)) {
      if (!value) continue;
      metafields.push({ namespace: 'custom', key, type: 'single_line_text_field', value });
    }

    const data = await shopifyAdminRequest<any>(PRODUCT_CREATE_MUTATION, {
      product: {
        title,
        productOptions: [{ name: 'Flavor', values: [{ name: 'Default' }] }],
        metafields,
      },
      media,
    });
    assertNoUserErrors(data.productCreate.userErrors, `productCreate (${region.label})`);
    const result = data.productCreate.product;
    if (!result) throw new Error(`productCreate returned no product and no userErrors for ${region.label}`);

    created.push({ id: result.id, title: result.title, region: region.value });
  }

  return created;
}

// ---------------------------------------------------------------------------------------------
// Publish / Unpublish -- deliberately separate, explicit, admin-triggered actions (never
// automatic). A Product Line's `status` (ACTIVE/DRAFT/ARCHIVED) and its `publishedAt`/publication
// state are two independent Shopify systems (live-verified 2026-08-24/25): `productCreate` sets
// status to ACTIVE by default, but that alone never makes a product visible to customers -- only
// `publishablePublish` targeting a specific sales channel (Publication) does that. We publish to
// "Online Store" specifically, looked up by name rather than hardcoded, since a Publication GID is
// store-specific.
// ---------------------------------------------------------------------------------------------

const GET_ONLINE_STORE_PUBLICATION_QUERY = /* GraphQL */ `
  query GetOnlineStorePublication {
    publications(first: 10) {
      nodes {
        id
        name
      }
    }
  }
`;

async function getOnlineStorePublicationId(): Promise<string> {
  const data = await shopifyAdminRequest<any>(GET_ONLINE_STORE_PUBLICATION_QUERY);
  const publication = data.publications.nodes.find((p: any) => p.name === 'Online Store');
  if (!publication) throw new Error('"Online Store" publication not found for this store');
  return publication.id;
}

const PUBLISHABLE_PUBLISH_MUTATION = /* GraphQL */ `
  mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

const PUBLISHABLE_UNPUBLISH_MUTATION = /* GraphQL */ `
  mutation PublishableUnpublish($id: ID!, $input: [PublicationInput!]!) {
    publishableUnpublish(id: $id, input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

/** Publishes a Product Line to the Online Store channel. Caller is responsible for only offering
 * this once the Product Line has at least one real Flavour (§0a -- a 0-flavour product going
 * live is a real incomplete state, not something to publish). */
export async function publishProductLine(productId: string): Promise<void> {
  await requireAdmin();
  const publicationId = await getOnlineStorePublicationId();
  const data = await shopifyAdminRequest<any>(PUBLISHABLE_PUBLISH_MUTATION, {
    id: productId,
    input: [{ publicationId }],
  });
  assertNoUserErrors(data.publishablePublish.userErrors, 'publishablePublish');
}

/** Takes a Product Line off the Online Store channel (does not delete it or its Flavours). */
export async function unpublishProductLine(productId: string): Promise<void> {
  await requireAdmin();
  const publicationId = await getOnlineStorePublicationId();
  const data = await shopifyAdminRequest<any>(PUBLISHABLE_UNPUBLISH_MUTATION, {
    id: productId,
    input: [{ publicationId }],
  });
  assertNoUserErrors(data.publishableUnpublish.userErrors, 'publishableUnpublish');
}
