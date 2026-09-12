'use client';

import Link from 'next/link';
import { useLiveInventoryTable, type InventorySnapshotRow } from '../hooks/useLiveInventoryTable';
import type { AttentionItem } from './LiveDashboardStats';
import { DashCard, DashCardHeader } from './DashCard';

const LOW_STOCK_THRESHOLD = 10;

/** Full-detail version of the Dashboard's "Needs Attention — Stock" widget -- every out-of-stock
 * and low-stock Flavour, grouped into its own section, not truncated to the widget's top 8. Same
 * live inventory feed (`useLiveInventoryTable`) so quantities here track the widget in real time. */
export default function AttentionStockList({
  initialInventoryRows,
  attentionLookup,
}: {
  initialInventoryRows: InventorySnapshotRow[];
  attentionLookup: AttentionItem[];
}) {
  const liveQuantities = useLiveInventoryTable(initialInventoryRows);

  const outOfStock = attentionLookup.filter((a) => (liveQuantities.get(a.inventoryItemId) ?? 0) === 0);
  const lowStock = attentionLookup.filter((a) => {
    const q = liveQuantities.get(a.inventoryItemId) ?? 0;
    return q > 0 && q < LOW_STOCK_THRESHOLD;
  });

  if (outOfStock.length === 0 && lowStock.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-dash-card-border bg-dash-card-bg p-8 text-center text-sm text-dash-text-muted">
        Nothing needs attention — every Flavour is stocked above {LOW_STOCK_THRESHOLD} units.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <AttentionSection title="Out of Stock" tone="danger" items={outOfStock} liveQuantities={liveQuantities} />
      <AttentionSection
        title={`Low Stock (below ${LOW_STOCK_THRESHOLD} units)`}
        tone="warning"
        items={lowStock}
        liveQuantities={liveQuantities}
      />
    </div>
  );
}

function AttentionSection({
  title,
  tone,
  items,
  liveQuantities,
}: {
  title: string;
  tone: 'danger' | 'warning';
  items: AttentionItem[];
  liveQuantities: Map<string, number>;
}) {
  if (items.length === 0) return null;

  return (
    <DashCard overflowHidden>
      <DashCardHeader title={title} count={items.length} />
      <ul>
        {items.map((item) => {
          const qty = liveQuantities.get(item.inventoryItemId) ?? 0;
          const numericId = item.productId.split('/').pop();
          return (
            <li key={item.inventoryItemId} className="border-b border-dash-divider last:border-0">
              <Link
                href={`/products/${numericId}/edit-flavours`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-neutral-50"
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-neutral-200" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-neutral-100 border border-neutral-200" />
                )}
                <div className="flex-1">
                  <div className="text-dash-text-ink font-medium">{item.productTitle}</div>
                  <div className="text-xs text-dash-text-muted">{item.flavourTitle}</div>
                </div>
                <span className={`text-xs font-semibold ${tone === 'danger' ? 'text-dash-danger' : 'text-dash-warning'}`}>
                  {qty} in stock
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </DashCard>
  );
}
