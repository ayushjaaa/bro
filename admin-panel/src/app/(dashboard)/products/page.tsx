import Link from 'next/link';
import { listProductLines } from '@/data/products';
import LiveTotalStock from '@/features/products/components/LiveTotalStock';

export default async function ProductsPage() {
  const products = await listProductLines();
  const incomplete = products.filter((p) => p.variantCount === 0);

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

      {incomplete.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ {incomplete.length} incomplete Product Line{incomplete.length === 1 ? '' : 's'} — 0
          flavours, not sellable yet.
        </div>
      )}

      {products.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          No Product Lines yet — click &quot;+ Add Product&quot; to create the first one.
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
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
    </div>
  );
}
