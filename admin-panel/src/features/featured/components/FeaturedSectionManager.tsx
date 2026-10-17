'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleFeaturedAction, searchProductsForFeaturedAction } from '../actions';
import type { FeaturedCollectionKey, FeaturedProduct } from '@/data/featured-collections';

export default function FeaturedSectionManager({
  collectionKey,
  title,
  initial,
}: {
  collectionKey: FeaturedCollectionKey;
  title: string;
  initial: FeaturedProduct[];
}) {
  const [products, setProducts] = useState(initial);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FeaturedProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const existingIds = new Set(products.map((p) => p.id));

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
    setProducts((prev) => [product, ...prev]); // optimistic
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
    setProducts((prev) => prev.filter((p) => p.id !== product.id)); // optimistic
    startTransition(async () => {
      const result = await toggleFeaturedAction(product.id, collectionKey, false);
      if (!result.ok) {
        setProducts((prev) => [product, ...prev]);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-neutral-700">
        {title} <span className="text-neutral-400 font-normal">({products.length})</span>
      </h2>

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
        <p className="text-sm text-neutral-400">No products yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-100">
          {products.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover border border-neutral-200" />
              ) : (
                <div className="w-8 h-8 rounded bg-neutral-100 border border-neutral-200" />
              )}
              <span className="flex-1 truncate text-sm text-neutral-800">{p.title}</span>
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
