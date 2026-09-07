import Link from 'next/link';
import { listProductLines } from '@/data/products';
import { buildAttentionData } from '@/features/dashboard/lib/attention';
import AttentionStockList from '@/features/dashboard/components/AttentionStockList';

/** Full "Needs Attention — Stock" list -- the Dashboard's widget only ever shows the first 8
 * out-of-stock/low-stock Flavours; this is where "View all" sends an admin to see every one of
 * them, not just the highlights. */
export default async function AttentionStockPage() {
  const products = await listProductLines();
  const { initialInventoryRows, attentionLookup } = buildAttentionData(products);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-neutral-400">
        <Link href="/" className="hover:underline">
          Dashboard
        </Link>{' '}
        / Needs Attention — Stock
      </p>
      <div>
        <h1 className="text-xl font-semibold">Needs Attention — Stock</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Every Flavour that's out of stock or running low, across every Product Line.
        </p>
      </div>

      <AttentionStockList initialInventoryRows={initialInventoryRows} attentionLookup={attentionLookup} />
    </div>
  );
}
