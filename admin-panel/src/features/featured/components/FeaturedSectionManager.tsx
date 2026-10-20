'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CaretIcon } from '@/components/icons';
import {
  toggleFeaturedAction,
  moveFeaturedAction,
  clearFeaturedAction,
  searchProductsForFeaturedAction,
} from '../actions';
import type { FeaturedCollectionKey, FeaturedProduct } from '@/data/featured-collections';

export default function FeaturedSectionManager({
  collectionKey,
  title,
  initial,
  homepageSlots,
}: {
  collectionKey: FeaturedCollectionKey;
  title: string;
  initial: FeaturedProduct[];
  /** First N products are the ones shown on the homepage tab -- badged so the admin can see
   * exactly what's live there. */
  homepageSlots: number;
}) {
  const [products, setProducts] = useState(initial);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FeaturedProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const existingIds = new Set(products.map((p) => p.id));
  // The storefront skips unpublished products, so the homepage tab is the first N *published* ones.
  const homepageIds = new Set(
    products
      .filter((p) => p.isPublished)
      .slice(0, homepageSlots)
      .map((p) => p.id)
  );

  async function handleSearch(q: string) {
    setQuery(q);
    setError(null);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const result = await searchProductsForFeaturedAction(q);
    setSearching(false);
    if (result.ok) {
      setResults(result.results.filter((r) => !existingIds.has(r.id)));
    } else {
      setError(result.error);
    }
  }

  function handleAdd(product: FeaturedProduct) {
    setError(null);
    setProducts((prev) => [product, ...prev]); // optimistic -- setProductFeatured moves new adds to the top
    setResults((prev) => prev.filter((r) => r.id !== product.id));
    setQuery('');
    startTransition(async () => {
      const result = await toggleFeaturedAction(product.id, collectionKey, true);
      if (!result.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== product.id));
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleRemove(product: FeaturedProduct) {
    setError(null);
    const before = products;
    setProducts((prev) => prev.filter((p) => p.id !== product.id)); // optimistic
    startTransition(async () => {
      const result = await toggleFeaturedAction(product.id, collectionKey, false);
      if (!result.ok) {
        setProducts(before);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  /** Swaps a product one place up/down -- the storefront shows the list in exactly this order. */
  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= products.length) return;
    setError(null);
    const before = products;
    const next = [...products];
    [next[index], next[target]] = [next[target], next[index]];
    setProducts(next); // optimistic -- Shopify's reorder runs as a background job
    startTransition(async () => {
      const result = await moveFeaturedAction(before[index].id, collectionKey, target);
      if (!result.ok) {
        setProducts(before);
        setError(result.error);
      }
    });
  }

  function handleClear() {
    if (!confirm(`Remove all ${products.length} products from ${title}? This tab will be empty on the storefront.`)) return;
    setError(null);
    const before = products;
    setProducts([]); // optimistic
    startTransition(async () => {
      const result = await clearFeaturedAction(collectionKey);
      if (!result.ok) {
        setProducts(before);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-700">
          {title} <span className="text-neutral-400 font-normal">({products.length})</span>
        </h2>
        {products.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            disabled={pending}
            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Remove all
          </button>
        )}
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search products to add..."
          className="w-full text-sm border border-neutral-300 rounded-md px-3 py-1.5"
        />
        {query.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-md">
            {searching ? (
              <p className="px-3 py-2 text-xs text-neutral-400">Searching...</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-neutral-400">No matches.</p>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleAdd(r)}
                  disabled={pending}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" className="w-6 h-6 rounded object-cover border border-neutral-200" />
                  ) : (
                    <div className="w-6 h-6 rounded bg-neutral-100 border border-neutral-200" />
                  )}
                  <span className="truncate">{r.title}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {products.length === 0 ? (
        <p className="text-sm text-neutral-400">No products yet -- this tab is empty on the storefront.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-100">
          {products.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => handleMove(i, -1)}
                  disabled={pending || i === 0}
                  aria-label={`Move ${p.title} up`}
                  className="text-neutral-400 hover:text-neutral-800 disabled:opacity-30"
                >
                  <CaretIcon direction="up" className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(i, 1)}
                  disabled={pending || i === products.length - 1}
                  aria-label={`Move ${p.title} down`}
                  className="text-neutral-400 hover:text-neutral-800 disabled:opacity-30"
                >
                  <CaretIcon direction="down" className="w-3 h-3" />
                </button>
              </div>
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover border border-neutral-200" />
              ) : (
                <div className="w-8 h-8 rounded bg-neutral-100 border border-neutral-200" />
              )}
              <span className="flex-1 truncate text-sm text-neutral-800">{p.title}</span>
              {homepageIds.has(p.id) && (
                <span className="text-[10px] font-medium uppercase tracking-wide text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                  On homepage
                </span>
              )}
              {!p.isPublished && (
                <span
                  title="Not shown on the storefront until this product is published"
                  className="text-[10px] font-medium uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
                >
                  Not published
                </span>
              )}
              <Link
                href={`/products/${p.id.split('/').pop()}`}
                className="text-xs font-medium text-neutral-600 hover:underline"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => handleRemove(p)}
                disabled={pending}
                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
