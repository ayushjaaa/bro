'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createProductLine,
  publishProductLine,
  unpublishProductLine,
  listProductLinesPage,
  PartialProductLineCreationError,
  type ProductLinesPage,
} from '@/data/products';
import { REGIONS } from '@/lib/regions';
import { SafeActionError, safeActionError } from '@/lib/action-errors';
import {
  bulkCreateVariants,
  updateVariants,
  adjustVariantQuantity,
  type VariantRow,
  type VariantUpdateRow,
  type BulkCreateResult,
} from '@/data/variants';

function fileOrUndefined(formData: FormData, key: string): File | undefined {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : undefined;
}

/** Thin Server Action — extract FormData (title, brandId, dynamic custom.* filter fields,
 * checked regions, optional image), call the DAL, revalidate. One submission creates one Product
 * Line **per checked region** (PRODUCT_PAGE_PLAN.md §11.3's "region checkboxes + auto-clone"),
 * so there's no single created-product id to redirect into anymore -- redirects to /products
 * (the list) where every newly-created region-clone shows up, each with 0 flavours for now (a
 * real, visibly-incomplete state per Section 0a, not a bug). */
export async function createProductLineAction(formData: FormData) {
  const filterValues: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('filter:') && typeof value === 'string' && value) {
      filterValues[key.slice('filter:'.length)] = value;
    }
  }

  const checkedRegionValues = new Set(formData.getAll('regions').map(String));
  const regions = REGIONS.filter((r) => checkedRegionValues.has(r.value));

  try {
    await createProductLine({
      title: String(formData.get('title') ?? ''),
      brandId: String(formData.get('brandId') ?? ''),
      filterValues,
      regions,
      image: fileOrUndefined(formData, 'image'),
    });
  } catch (err) {
    // A5: a partial failure means at least one region's real Shopify product already exists --
    // tell the admin exactly which ones, don't just say "something went wrong" and hide that.
    if (err instanceof PartialProductLineCreationError) {
      const regionsCreated = err.created.map((c) => c.region).join(', ');
      throw new SafeActionError(
        `${err.message} Regions created: ${regionsCreated}. Check the Products list and Shopify admin before retrying -- do not resubmit the whole form.`
      );
    }
    throw new SafeActionError(safeActionError(err, 'Failed to create Product Line. Please try again.', 'products:create'));
  }

  revalidatePath('/products');
  redirect('/products');
}

/** Thin Server Action — extracts indexed `row:<i>:<field>` FormData entries into VariantRow[],
 * calls the DAL (batches of 100, §5 Flow C), revalidates the product's detail page. */
export async function bulkCreateVariantsAction(formData: FormData): Promise<BulkCreateResult> {
  const productId = String(formData.get('productId') ?? '');
  const rowCount = Number(formData.get('rowCount') ?? 0);

  const rows: VariantRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    const flavourName = String(formData.get(`row:${i}:flavourName`) ?? '');
    if (!flavourName) continue;
    rows.push({
      flavourName,
      description: String(formData.get(`row:${i}:description`) ?? ''),
      price: String(formData.get(`row:${i}:price`) ?? ''),
      compareAtPrice: (formData.get(`row:${i}:compareAtPrice`) as string) || undefined,
      retailPrice: (formData.get(`row:${i}:retailPrice`) as string) || undefined,
      sku: (formData.get(`row:${i}:sku`) as string) || undefined,
      quantity: (formData.get(`row:${i}:quantity`) as string) || undefined,
      image: fileOrUndefined(formData, `row:${i}:image`),
    });
  }

  const result = await bulkCreateVariants(productId, rows);

  revalidatePath(`/products/${productId.split('/').pop()}`);
  revalidatePath('/products');
  return result;
}

/** Thin Server Action — extracts indexed `row:<i>:<field>` FormData entries into
 * VariantUpdateRow[] (one row = one Flavour edit; the caller may submit just one row for a
 * single-Flavour edit, or many for a bulk edit -- same call either way), calls the DAL. */
export async function updateVariantsAction(formData: FormData): Promise<BulkCreateResult> {
  const productId = String(formData.get('productId') ?? '');
  const rowCount = Number(formData.get('rowCount') ?? 0);

  const rows: VariantUpdateRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    const id = String(formData.get(`row:${i}:id`) ?? '');
    if (!id) continue;
    rows.push({
      id,
      inventoryItemId: (formData.get(`row:${i}:inventoryItemId`) as string) || null,
      description: String(formData.get(`row:${i}:description`) ?? ''),
      price: String(formData.get(`row:${i}:price`) ?? ''),
      compareAtPrice: (formData.get(`row:${i}:compareAtPrice`) as string) || undefined,
      retailPrice: (formData.get(`row:${i}:retailPrice`) as string) || undefined,
      sku: (formData.get(`row:${i}:sku`) as string) || undefined,
      quantity: (formData.get(`row:${i}:quantity`) as string) || undefined,
      currentQuantity: Number(formData.get(`row:${i}:currentQuantity`) ?? 0),
      isActivatedAtLocation: formData.get(`row:${i}:isActivatedAtLocation`) === 'true',
    });
  }

  const result = await updateVariants(productId, rows);

  revalidatePath(`/products/${productId.split('/').pop()}`);
  revalidatePath('/products');
  return result;
}

/** Backs the /products table's Next/Previous controls -- called from the client with whichever
 * cursor it wants to jump to (its own cursor stack tracks "previous"; `endCursor` from the last
 * response is "next"), so paging never re-fetches the same Shopify `first: 100` window the old
 * unpaginated listProductLines() was stuck with. */
export async function getProductLinesPageAction(params: { cursor?: string | null; limit: number }): Promise<ProductLinesPage> {
  return listProductLinesPage(params);
}

/** Thin Server Action — publishes a Product Line to the Online Store channel. */
export async function publishProductLineAction(formData: FormData) {
  const productId = String(formData.get('productId') ?? '');
  await publishProductLine(productId);
  revalidatePath(`/products/${productId.split('/').pop()}`);
  revalidatePath('/products');
}

/** Thin Server Action — takes a Product Line off the Online Store channel. */
export async function unpublishProductLineAction(formData: FormData) {
  const productId = String(formData.get('productId') ?? '');
  await unpublishProductLine(productId);
  revalidatePath(`/products/${productId.split('/').pop()}`);
  revalidatePath('/products');
}

/** Thin Server Action — restocks a Flavour by a relative delta (e.g. "+20 just arrived"),
 * distinct from updateVariantsAction's "set to N" (§ user request 2026-08-25). */
export async function adjustVariantQuantityAction(formData: FormData) {
  const productId = String(formData.get('productId') ?? '');
  const inventoryItemId = String(formData.get('inventoryItemId') ?? '');
  const delta = Number(formData.get('delta') ?? 0);
  const currentQuantity = Number(formData.get('currentQuantity') ?? 0);

  // Guard the server boundary itself -- the one existing caller validates client-side, but a
  // Server Action is a public endpoint and must not trust that every caller does the same.
  if (!Number.isFinite(delta) || delta === 0 || !Number.isFinite(currentQuantity)) {
    return { ok: false, error: 'Quantity change must be a non-zero number' };
  }

  const result = await adjustVariantQuantity(inventoryItemId, delta, currentQuantity);

  revalidatePath(`/products/${productId.split('/').pop()}`);
  revalidatePath(`/products/${productId.split('/').pop()}/edit-flavours`);
  return result;
}
