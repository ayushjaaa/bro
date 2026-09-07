'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ProductLinesPage } from '@/data/products';
import { getProductLinesPageAction } from '../actions';
import { PRODUCTS_PAGE_SIZE } from '../constants';
import LiveTotalStock from './LiveTotalStock';

/**
 * Paginated /products table. Shopify's Admin API only supports cursor (`after`) pagination, not
 * offset/limit, so "Previous" doesn't re-fetch -- every page visited gets cached by its index in
 * `pages`, and since navigation only ever moves one step at a time, the page behind the current
 * one is always already in that cache. "Next" is the only case that hits the server, using the
 * current page's `endCursor`.
 *
 * The "incomplete Product Lines" banner counts only the current page, not the whole catalog --
 * real pagination means there's no full list in memory to count against anymore.
 */
export default function ProductsTable({ initialPage }: { initialPage: ProductLinesPage }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pages, setPages] = useState<Map<number, ProductLinesPage>>(() => new Map([[0, initialPage]]));
  const [isLoading, setIsLoading] = useState(false);

  const current = pages.get(pageIndex) ?? initialPage;
  const products = current.products;
  const incomplete = products.filter((p) => p.variantCount === 0);

  async function goNext() {
    if (!current.hasNextPage) return;
    const nextIndex = pageIndex + 1;
    const cached = pages.get(nextIndex);
    if (cached) {
      setPageIndex(nextIndex);
      return;
    }
    setIsLoading(true);
    try {
      const result = await getProductLinesPageAction({ cursor: current.endCursor, limit: PRODUCTS_PAGE_SIZE });
      setPages((prev) => new Map(prev).set(nextIndex, result));
      setPageIndex(nextIndex);
    } finally {
      setIsLoading(false);
    }
  }

  function goPrevious() {
    if (pageIndex === 0) return;
    setPageIndex(pageIndex - 1);
  }

  return (
    <div className="flex flex-col gap-4">
      {incomplete.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ {incomplete.length} incomplete Product Line{incomplete.length === 1 ? '' : 's'} on this page — 0
          flavours, not sellable yet.
        </div>
      )}

      {products.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          No Product Lines yet — click &quot;+ Add Product&quot; to create the first one.
        </div>
      ) : (
        <div
          className={`rounded-lg border border-neutral-200 bg-white overflow-hidden transition-opacity ${isLoading ? 'opacity-60' : ''}`}
        >
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Product</th>
                <th className="text-left px-4 py-2 font-medium">Category</th>
                <th className="text-left px-4 py-2 font-medium">Sub-category</th>
                <th className="text-left px-4 py-2 font-medium">Brand</th>
                <th className="text-left px-4 py-2 font-medium">Flavours</th>
                <th className="text-left px-4 py-2 font-medium">Price</th>
                <th className="text-left px-4 py-2 font-medium">Stock</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Live?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {products.map((p) => {
                const numericId = p.id.split('/').pop();
                return (
                  <tr key={p.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/products/${numericId}`} className="flex items-center gap-2.5">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover border border-neutral-200" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-neutral-100 border border-neutral-200" />
                        )}
                        <span className="text-neutral-800 hover:underline">{p.title}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{p.categoryName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{p.subcategoryName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{p.brandName ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {p.variantCount === 0 ? (
                        <span className="text-amber-700 font-medium">0 flavours ⚠</span>
                      ) : (
                        <span className="text-neutral-600">{p.variantCount}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">
                      {p.minPrice === p.maxPrice
                        ? `${p.currencyCode} ${p.minPrice}`
                        : `${p.currencyCode} ${p.minPrice}–${p.maxPrice}`}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">
                      <LiveTotalStock variants={p.variantStock} />
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500 capitalize">{p.status.toLowerCase()}</td>
                    <td className="px-4 py-2.5">
                      {p.isPublished ? (
                        <span className="text-emerald-700 text-xs font-medium">● Live</span>
                      ) : (
                        <span className="text-neutral-400 text-xs font-medium">○ Not published</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(pageIndex > 0 || current.hasNextPage) && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-neutral-500">Page {pageIndex + 1}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrevious}
              disabled={pageIndex === 0 || isLoading}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!current.hasNextPage || isLoading}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
