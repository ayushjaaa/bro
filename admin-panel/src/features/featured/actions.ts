'use server';

import { revalidatePath } from 'next/cache';
import {
  FEATURED_COLLECTION_KEYS,
  setProductFeatured,
  moveFeaturedProduct,
  clearFeaturedProducts,
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

export async function moveFeaturedAction(
  productId: string,
  key: FeaturedCollectionKey,
  newPosition: number
): Promise<ActionResult> {
  try {
    await moveFeaturedProduct(key, productId, newPosition);
    revalidatePath('/featured');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: safeActionError(error, 'Could not change the order. Please try again.', 'featured:move'),
    };
  }
}

export async function clearFeaturedAction(key: FeaturedCollectionKey): Promise<ActionResult> {
  try {
    await clearFeaturedProducts(key);
    revalidatePath('/featured');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: safeActionError(error, 'Could not remove the products. Please try again.', 'featured:clear'),
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
  { ok: true; lists: Record<FeaturedCollectionKey, FeaturedProduct[]> } | { ok: false; error: string }
> {
  try {
    const results = await Promise.all(FEATURED_COLLECTION_KEYS.map((key) => listFeaturedProducts(key)));
    const lists = Object.fromEntries(FEATURED_COLLECTION_KEYS.map((key, i) => [key, results[i]])) as Record<
      FeaturedCollectionKey,
      FeaturedProduct[]
    >;
    return { ok: true, lists };
  } catch (error) {
    return {
      ok: false,
      error: safeActionError(error, 'Could not load featured products. Please try again.', 'featured:list'),
    };
  }
}
