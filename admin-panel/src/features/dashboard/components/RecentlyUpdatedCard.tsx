'use client';

import Link from 'next/link';
import { useLiveTable } from '../hooks/useLiveTable';
import { DashCard } from './DashCard';
import type { ProductHealthRow } from './ProductHealthPanel';

/**
 * Extracted out of ProductHealthPanel so it can render right beside "Needs Attention --
 * Stock" / "Published Rate" instead of being buried further down the page under the mini
 * stat tiles and Status Breakdown. Own `useLiveTable` subscription (same table, same key) so
 * it stays live independent of ProductHealthPanel's own subscription.
 */
export default function RecentlyUpdatedCard({ initialProductHealth }: { initialProductHealth: ProductHealthRow[] }) {
  const products = [...useLiveTable('product_health_snapshot', 'product_id', initialProductHealth).values()];
  const recentlyUpdated = [...products].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);

  if (recentlyUpdated.length === 0) {
    return (
      <DashCard className="p-5 flex items-center justify-center text-sm text-dash-text-muted">
        No catalog activity yet.
      </DashCard>
    );
  }

  return (
    <DashCard overflowHidden>
      <h2 className="text-sm font-bold text-dash-text-ink px-5 pt-5 pb-2">Recently Updated</h2>
      <ul>
        {recentlyUpdated.map((p) => {
          const numericId = p.product_id.split('/').pop();
          return (
            <li key={p.product_id} className="border-t border-dash-divider">
              <Link href={`/products/${numericId}`} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-neutral-50">
                <div>
                  <span className="text-dash-text-ink">{p.title}</span>
                  <span
                    className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                      p.status === 'ACTIVE'
                        ? 'bg-dash-pill-success-bg text-dash-pill-success-text border-dash-pill-success-text/20'
                        : p.status === 'DRAFT'
                          ? 'bg-dash-pill-warning-bg text-dash-pill-warning-text border-dash-pill-warning-text/20'
                          : 'bg-dash-pill-neutral-bg text-dash-pill-neutral-text border-dash-pill-neutral-text/20'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <span className="text-xs text-dash-text-muted">{p.variant_count} Flavours</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </DashCard>
  );
}
