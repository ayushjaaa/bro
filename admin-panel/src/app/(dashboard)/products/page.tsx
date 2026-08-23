import Link from 'next/link';

/** Placeholder — real listing wired to data/product-lines.ts is tracked in
 * ADMIN_PANEL_IMPLEMENTATION.md §3, not built yet. */
export default function ProductsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Products</h1>
        <Link
          href="/products/new"
          className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700"
        >
          + Add Product
        </Link>
      </div>
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
        Product list coming soon — wire to data/product-lines.ts.
      </div>
    </div>
  );
}
