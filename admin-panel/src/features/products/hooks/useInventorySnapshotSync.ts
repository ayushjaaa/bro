'use client';

import { useEffect, useRef } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type SnapshotRow = {
  inventory_item_id: string;
  quantity: number;
};

/**
 * Subscribes to live inventory_snapshot updates (Supabase Realtime) for the given inventory item
 * IDs, plus a ~5-minute polling fallback for the portion of webhooks Shopify simply never
 * delivers (its own documented lack of delivery guarantees -- unfixable on our end, so this is a
 * backstop, not the primary mechanism). `onUpdate` is called with the freshest known quantity per
 * item; the caller (EditVariantsTable) decides whether to apply it (only to non-dirty rows).
 */
export function useInventorySnapshotSync(
  inventoryItemIds: string[],
  onUpdate: (inventoryItemId: string, quantity: number) => void
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const idsKey = inventoryItemIds.join(',');

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (ids.length === 0) return;

    const supabase = createSupabaseBrowserClient();

    // Channel names must be unique per subscription -- createSupabaseBrowserClient() returns a
    // cached/shared client instance (the official @supabase/ssr pattern, to avoid duplicate
    // GoTrueClient warnings), so multiple components using this hook at once (e.g. one per row on
    // the product detail page, plus one for the page's total) all share that same underlying
    // realtime client. A fixed channel name meant a second subscriber's `.on()` call landed on an
    // already-`subscribe()`d channel object from the first, which Supabase rejects.
    const channel = supabase
      .channel(`inventory-snapshot-changes-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_snapshot' },
        (payload) => {
          const row = payload.new as SnapshotRow | undefined;
          if (!row || !ids.includes(row.inventory_item_id)) return;
          onUpdateRef.current(row.inventory_item_id, row.quantity);
        }
      )
      .subscribe();

    async function pollOnce() {
      const { data } = await supabase
        .from('inventory_snapshot')
        .select('inventory_item_id, quantity')
        .in('inventory_item_id', ids);
      for (const row of data ?? []) {
        onUpdateRef.current(row.inventory_item_id, row.quantity);
      }
    }
    const intervalId = setInterval(pollOnce, 5 * 60 * 1000);

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [idsKey]);
}
