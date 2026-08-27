'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createProductLine, publishProductLine, unpublishProductLine } from '@/data/products';
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
 * optional image), call the DAL, revalidate. Redirects to /products -- the Bulk Variant Upload
 * page (/products/[id]/variants, Flow C) isn't built yet, so a Product Line lands there with 0
 * flavours for now (a real, visibly-incomplete state per Section 0a, not a bug). */
export async function createProductLineAction(formData: FormData) {
  const filterValues: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('filter:') && typeof value === 'string' && value) {
      filterValues[key.slice('filter:'.length)] = value;
    }
  }

  await createProductLine({
    title: String(formData.get('title') ?? ''),
    brandId: String(formData.get('brandId') ?? ''),
    filterValues,
    image: fileOrUndefined(formData, 'image'),
  });

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
      region: String(formData.get(`row:${i}:region`) ?? ''),
      price: String(formData.get(`row:${i}:price`) ?? ''),
      compareAtPrice: (formData.get(`row:${i}:compareAtPrice`) as string) || undefined,
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
      region: String(formData.get(`row:${i}:region`) ?? ''),
      price: String(formData.get(`row:${i}:price`) ?? ''),
      compareAtPrice: (formData.get(`row:${i}:compareAtPrice`) as string) || undefined,
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

  const result = await adjustVariantQuantity(inventoryItemId, delta, currentQuantity);

  revalidatePath(`/products/${productId.split('/').pop()}`);
  revalidatePath(`/products/${productId.split('/').pop()}/edit-flavours`);
  return result;
}
