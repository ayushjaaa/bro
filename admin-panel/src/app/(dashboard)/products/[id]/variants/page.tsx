import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProductLine } from '@/data/products';
import VariantBulkTable from '@/features/products/components/VariantBulkTable';

export default async function AddFlavoursPage({ params }: { params: Promise<{ id: string }> }) {
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
        / Add Flavours
      </p>
      <h1 className="text-xl font-semibold">Add Flavours — {product.title}</h1>
      <p className="text-sm text-neutral-500">
        Currently {product.variantCount} flavour{product.variantCount === 1 ? '' : 's'}. Region is
        required for every row.
      </p>
      <VariantBulkTable productId={productId} numericId={id} productTitle={product.title} />
    </div>
  );
}
