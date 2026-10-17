'use server';

import { revalidatePath } from 'next/cache';
import {
  setProductFeatured,
  listFeaturedProducts,
  searchProductsForFeatured,
  type FeaturedCollectionKey,
  type FeaturedProduct,
} from '@/data/featured-collections';
import { safeActionError } from '@/lib/action-errors';

type ActionResult = { ok: true } | { ok: false; error: string };

export async function toggleFeaturedAction(
  productId: string,
  key: FeaturedCollectionKey,
  featured: boolean,
  productDetailPathId?: string
): Promise<ActionResult> {
  try {
    await setProductFeatured(key, productId, featured);
    revalidatePath('/featured');
    if (productDetailPathId) revalidatePath(`/products/${productDetailPathId}`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: safeActionError(error, 'Could not update featured status. Please try again.', 'featured:toggle'),
    };
  }
}

export async function searchProductsForFeaturedAction(
  query: string
): Promise<{ ok: true; results: FeaturedProduct[] } | { ok: false; error: string }> {
  try {
    const results = await searchProductsForFeatured(query);
    return { ok: true, results };
  } catch (error) {
    return {
      ok: false,
      error: safeActionError(error, 'Search failed. Please try again.', 'featured:search'),
    };
  }
}

export async function getFeaturedListsAction(): Promise<
  { ok: true; trending: FeaturedProduct[]; promotions: FeaturedProduct[] } | { ok: false; error: string }
> {
  try {
    const [trending, promotions] = await Promise.all([
      listFeaturedProducts('trending'),
      listFeaturedProducts('promotions'),
    ]);
    return { ok: true, trending, promotions };
  } catch (error) {
    return {
      ok: false,
      error: safeActionError(error, 'Could not load featured products. Please try again.', 'featured:list'),
    };
  }
}
