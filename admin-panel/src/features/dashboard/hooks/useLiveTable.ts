'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/** Generic Realtime subscription for a small, unfiltered table (product_health_snapshot,
 * variant_sku_index, customers, cart_events, order_status_log) -- unlike
 * useInventorySnapshotSync/useLiveInventoryTable, this doesn't filter by ids, since these tables
 * are already small (bounded by product/variant/customer count, not inventory-check-event volume)
 * and every row matters to at least one Dashboard/Customers widget. Holds the full row set keyed
 * by the given primary key field, applying INSERT/UPDATE/DELETE events as they arrive.
 * `initialRows` seeds it so the page shows correct data even before any Realtime event has fired.
 */
export function useLiveTable<T extends Record<string, any>>(
  table: string,
  // A single column name for a normal primary key, or a function for a composite one (e.g.
  // cart_snapshot's (customer_id, variant_id) pair) -- either way it must derive the same string
  // for a given row regardless of whether that row came from `initialRows` or a Realtime payload.
  primaryKey: keyof T | ((row: T) => string),
  initialRows: T[]
): Map<string, T> {
  const keyOf = typeof primaryKey === 'function' ? primaryKey : (row: T) => String(row[primaryKey]);
  const [rows, setRows] = useState<Map<string, T>>(() => new Map(initialRows.map((r) => [keyOf(r), r])));

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // RLS-protected tables (admin-only read, e.g. cart_events, customers, order_status_log) need
    // the connected client's actual JWT attached to the Realtime websocket -- Realtime evaluates
    // RLS per subscriber using whatever JWT it currently has, and does NOT automatically pick up
    // the browser's cookie-based session the way a normal page request does. Without this
    // explicit handoff, the subscription reports SUBSCRIBED successfully but silently receives
    // nothing.
    async function setupSubscription() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }
      if (cancelled) return;

      channel = supabase
        .channel(`${table}-changes-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          setRows((prev) => {
            const next = new Map(prev);
            if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as T | undefined;
              if (oldRow) next.delete(keyOf(oldRow));
            } else {
              const row = payload.new as T;
              next.set(keyOf(row), row);
            }
            return next;
          });
        })
        .subscribe();
    }
    setupSubscription();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  return rows;
}
