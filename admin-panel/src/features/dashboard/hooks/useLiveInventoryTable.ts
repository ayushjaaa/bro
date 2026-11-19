'use client';

import { useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type InventorySnapshotRow = {
  inventory_item_id: string;
  quantity: number;
};

/**
 * Subscribes to EVERY row of inventory_snapshot (not filtered to specific ids, unlike
 * useInventorySnapshotSync which is used by single-product screens) -- this is what lets the
 * Dashboard compute store-wide Total Stock / Out-of-Stock / Low-Stock live, using only the
 * inventory webhook pipeline that's already built and tested today (does not depend on the
 * store_stock_totals/out_of_stock_items/low_stock_items aggregate tables from the plan's later
 * migration -- those are a future optimization for very large catalogs; at this store's current
 * scale, holding the full row set client-side and filtering it is simple and correct).
 */
export function useLiveInventoryTable(initialRows: InventorySnapshotRow[]) {
  const [rows, setRows] = useState<Map<string, number>>(
    () => new Map(initialRows.map((r) => [r.inventory_item_id, r.quantity]))
  );
  const initialRef = useRef(initialRows);
  // Only Flavours in the page's own list are tracked. inventory_snapshot also holds rows for items
  // the page never listed (other locations' items, leftovers), and adding those made Total Stock
  // creep upward during a session.
  const knownIdsRef = useRef(new Set(initialRows.map((r) => r.inventory_item_id)));

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`dashboard-inventory-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_snapshot' },
        (payload) => {
          const row = payload.new as InventorySnapshotRow | undefined;
          if (!row || !knownIdsRef.current.has(row.inventory_item_id)) return;
          setRows((prev) => {
            const next = new Map(prev);
            next.set(row.inventory_item_id, row.quantity);
            return next;
          });
        }
      )
      .subscribe();

    // Batched: the ids go in the request URL, and the full catalog (~1,500 Flavours) in one
    // `.in()` is far past what the URL can carry -- that request just failed, silently.
    const POLL_BATCH_SIZE = 150;
    async function pollOnce() {
      const ids = initialRef.current.map((r) => r.inventory_item_id);
      for (let i = 0; i < ids.length; i += POLL_BATCH_SIZE) {
        const { data, error } = await supabase
          .from('inventory_snapshot')
          .select('inventory_item_id, quantity')
          .in('inventory_item_id', ids.slice(i, i + POLL_BATCH_SIZE));
        if (error || !data) {
          console.error('[useLiveInventoryTable] poll failed:', error);
          continue;
        }
        setRows((prev) => {
          const next = new Map(prev);
          for (const row of data) next.set(row.inventory_item_id, row.quantity);
          return next;
        });
      }
    }
    const intervalId = setInterval(pollOnce, 5 * 60 * 1000);

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, []);

  return rows;
}
