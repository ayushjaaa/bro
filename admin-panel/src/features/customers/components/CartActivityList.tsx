'use client';

import { useLiveTable } from '@/features/dashboard/hooks/useLiveTable';
import type { CartEvent } from '@/data/customers';

type CartEventRow = {
  id: string;
  customer_id: string | null;
  product_id: string | null;
  action: string;
  quantity: number | null;
  event_at: string;
};

function toRow(e: CartEvent): CartEventRow {
  return {
    id: e.id,
    customer_id: e.customerId,
    product_id: e.productId,
    action: e.action,
    quantity: e.quantity,
    event_at: e.eventAt,
  };
}

/** Reverse-chronological, live-updating (Supabase Realtime) -- no pagination for V1 (expected
 * volume is low; add if it becomes a real problem). Reuses the generic useLiveTable hook already
 * built for the Dashboard's product-health/inventory widgets. */
export default function CartActivityList({ initialEvents }: { initialEvents: CartEvent[] }) {
  const events = [...useLiveTable('cart_events', 'id', initialEvents.map(toRow)).values()].sort((a, b) =>
    b.event_at.localeCompare(a.event_at)
  );

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
        No cart activity reported yet — this fills in once the storefront reports events here.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
      <ul>
        {events.map((e) => (
          <li key={e.id} className="border-b border-neutral-50 last:border-0 px-4 py-3 text-sm flex items-center justify-between">
            <div>
              <span className="font-medium text-neutral-800 capitalize">{e.action.replace(/_/g, ' ')}</span>
              {e.product_id && <span className="text-neutral-500 ml-2 text-xs">{e.product_id}</span>}
              {e.quantity != null && <span className="text-neutral-400 ml-2 text-xs">×{e.quantity}</span>}
            </div>
            <span className="text-xs text-neutral-400">{new Date(e.event_at).toLocaleString('en-CA')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
