'use server';

import { revalidatePath } from 'next/cache';
import { createCategory, createSubcategory, createBrand } from '@/data/taxonomy';

function fileOrUndefined(formData: FormData, key: string): File | undefined {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : undefined;
}

/** Thin Server Actions — extract FormData, call the DAL, revalidate. No Shopify calls here. */

export async function createCategoryAction(formData: FormData) {
  const entry = await createCategory({
    name: String(formData.get('name') ?? ''),
    description: (formData.get('description') as string) || undefined,
    image: fileOrUndefined(formData, 'image'),
  });
  revalidatePath('/taxonomy');
  return entry;
}

export async function createSubcategoryAction(formData: FormData) {
  const entry = await createSubcategory({
    name: String(formData.get('name') ?? ''),
    description: (formData.get('description') as string) || undefined,
    image: fileOrUndefined(formData, 'image'),
    categoryId: String(formData.get('categoryId') ?? ''),
  });
  revalidatePath('/taxonomy');
  return entry;
}

export async function createBrandAction(formData: FormData) {
  const entry = await createBrand({
    name: String(formData.get('name') ?? ''),
    description: (formData.get('description') as string) || undefined,
    logo: fileOrUndefined(formData, 'logo'),
    subcategoryId: String(formData.get('subcategoryId') ?? ''),
  });
  revalidatePath('/taxonomy');
  return entry;
}
