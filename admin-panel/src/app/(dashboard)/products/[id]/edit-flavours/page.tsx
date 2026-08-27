import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProductLine } from '@/data/products';
import EditVariantsTable from '@/features/products/components/EditVariantsTable';

export default async function EditFlavoursPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = `gid://shopify/Product/${id}`;
  const product = await getProductLine(productId);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-neutral-400">
        <Link href="/products" className="hover:underline">
          Products
        </Link>{' '}
        /{' '}
        <Link href={`/products/${id}`} className="hover:underline">
          {product.title}
        </Link>{' '}
        / Edit Flavours
      </p>
      <h1 className="text-xl font-semibold">Edit Flavours — {product.title}</h1>
      {product.variants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          No Flavours yet — nothing to edit.
        </div>
      ) : (
        <EditVariantsTable productId={productId} variants={product.variants} />
      )}
    </div>
  );
}
