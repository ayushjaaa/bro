import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProductLine } from '@/data/products';
import { listFilterDefinitions } from '@/data/filters';
import PublishButton from '@/features/products/components/PublishButton';
import LiveTotalStock from '@/features/products/components/LiveTotalStock';
import LiveVariantStock from '@/features/products/components/LiveVariantStock';

export default async function ProductLineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = `gid://shopify/Product/${id}`;

  const [product, filterDefinitions] = await Promise.all([
    getProductLine(productId),
    listFilterDefinitions(),
  ]);

  if (!product) notFound();

  const labelForKey = (key: string) => filterDefinitions.find((f) => f.key === key)?.label ?? key;

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-neutral-400">
            <Link href="/products" className="hover:underline">
              Products
            </Link>{' '}
            / {product.title}
          </p>
          <h1 className="text-xl font-semibold">{product.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              product.status === 'ACTIVE'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
            }`}
          >
            {product.status}
          </span>
          {product.isPublished ? (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              ● Live
            </span>
          ) : (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-500 border border-neutral-200">
              ○ Not published
            </span>
          )}
          {(product.isPublished || product.variantCount > 0) && (
            <PublishButton productId={product.id} isPublished={product.isPublished} />
          )}
        </div>
      </div>

      {/* Breadcrumb: Category / Sub-category / Brand */}
      <p className="text-sm text-neutral-500">
        {product.categoryName ?? '—'} / {product.subcategoryName ?? '—'} / {product.brandName ?? '—'}
      </p>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-400">
        <span>
          Price:{' '}
          {product.minPrice === product.maxPrice
            ? `${product.currencyCode} ${product.minPrice}`
            : `${product.currencyCode} ${product.minPrice}–${product.maxPrice}`}
        </span>
        <span>
          Stock: <LiveTotalStock variants={product.variants.map((v) => ({ inventoryItemId: v.inventoryItemId, quantity: v.quantity }))} />
        </span>
        <span>Created: {new Date(product.createdAt).toLocaleDateString()}</span>
        <span>Updated: {new Date(product.updatedAt).toLocaleDateString()}</span>
        {product.isPublished && product.onlineStorePreviewUrl && (
          <a
            href={product.onlineStorePreviewUrl}
            target="_blank"
            rel="noreferrer"
            className="text-emerald-700 hover:underline"
          >
            View on storefront →
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Images */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt={product.title} className="w-full rounded object-cover" />
          ) : (
            <div className="w-full aspect-square rounded bg-neutral-100 flex items-center justify-center text-xs text-neutral-400">
              No image
            </div>
          )}
          {product.images.length > 1 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {product.images.slice(1).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="w-12 h-12 rounded object-cover border border-neutral-200" />
              ))}
            </div>
          )}
        </div>

        {/* Product-Level details */}
        <div className="md:col-span-2 rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">Product-Level Details</h2>
          {product.customFields.length === 0 ? (
            <p className="text-sm text-neutral-400">No extra fields set on this Product Line.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {product.customFields.map((f) => (
                <div key={f.key}>
                  <dt className="text-neutral-400 text-xs">{labelForKey(f.key)}</dt>
                  <dd className="text-neutral-800">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {product.descriptionHtml && (
            <>
              <h2 className="text-sm font-semibold text-neutral-700 mt-4 mb-2">Description</h2>
              <div
                className="text-sm text-neutral-600 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
              />
            </>
          )}
        </div>
      </div>

      {/* Flavours */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-700">
            Flavours <span className="text-neutral-400 font-normal">({product.variantCount})</span>
          </h2>
          <div className="flex items-center gap-3">
            {product.variantCount > 0 && (
              <Link
                href={`/products/${id}/edit-flavours`}
                className="text-xs font-medium text-sky-700 hover:underline"
              >
                Edit Flavours
              </Link>
            )}
            <Link
              href={`/products/${id}/variants`}
              className="text-xs font-medium text-emerald-700 hover:underline"
            >
              + Add Flavours
            </Link>
          </div>
        </div>

        {product.variantCount === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            ⚠ No flavours yet — this Product Line isn&apos;t sellable until at least one is added.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-neutral-400 text-xs uppercase">
                <tr>
                  <th className="text-left py-1.5 pr-3 font-medium">Image</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Flavour</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Region</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Price</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Stock</th>
                  <th className="text-left py-1.5 pr-3 font-medium">SKU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {product.variants.map((v) => (
                  <tr key={v.id}>
                    <td className="py-1.5 pr-3">
                      {v.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.imageUrl} alt="" className="w-8 h-8 rounded object-cover border border-neutral-200" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-neutral-100 border border-neutral-200" />
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-neutral-800">{v.title}</td>
                    <td className="py-1.5 pr-3 text-neutral-600">{v.region ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-neutral-600">${v.price}</td>
                    <td className="py-1.5 pr-3">
                      <LiveVariantStock inventoryItemId={v.inventoryItemId} quantity={v.quantity} />
                    </td>
                    <td className="py-1.5 pr-3 text-neutral-500">{v.sku ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {product.variantCount > product.variants.length && (
              <p className="text-xs text-neutral-400 mt-2">
                Showing first {product.variants.length} of {product.variantCount} flavours.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
