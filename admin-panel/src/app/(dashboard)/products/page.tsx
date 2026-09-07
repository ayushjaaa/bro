import Link from 'next/link';
import { listProductLinesPage } from '@/data/products';
import ProductsTable from '@/features/products/components/ProductsTable';
import { PRODUCTS_PAGE_SIZE } from '@/features/products/constants';

export default async function ProductsPage() {
  const firstPage = await listProductLinesPage({ cursor: null, limit: PRODUCTS_PAGE_SIZE });

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

      <ProductsTable initialPage={firstPage} />
    </div>
  );
}
