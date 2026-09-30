'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type LiveTableConnectionState = 'connected' | 'reconnecting';

/** Pure decision logic extracted out of the hook body specifically so it can be unit-tested with
 * plain `node:test` (this project has no React-hook-testing infrastructure -- see
 * tests/unit/use-live-table-logic.test.ts) rather than only through a live browser/network
 * simulation, which turned out to be unreliable here: Playwright's `context.setOffline()` does
 * not reliably sever an already-established WebSocket connection in this environment (confirmed
 * via a throwaway diagnostic -- 15s+ offline produced zero heartbeat/reconnect activity), so a
 * network-drop e2e test would be flaky/slow for no real gain in confidence over testing this
 * decision directly. */

/** Should the heartbeatCallback actually attempt a reconnect right now? Guards against acting on
 * anything but a genuine 'disconnected' report, and against starting a second reconnect attempt
 * while one is already in flight. */
export function shouldAttemptReconnect(status: string, alreadyReconnecting: boolean): boolean {
  return status === 'disconnected' && !alreadyReconnecting;
}

/** Should a 'SUBSCRIBED' channel status trigger a full resync? Only true for a REAL reconnect
 * (the channel was already subscribed once before) with an onReconnect callback available --
 * never on the very first subscribe, which is already covered by `initialRows`. */
export function shouldResyncOnSubscribe(
  status: string,
  hasSubscribedOnce: boolean,
  hasOnReconnect: boolean
): boolean {
  return status === 'SUBSCRIBED' && hasSubscribedOnce && hasOnReconnect;
}

/** Merges one incoming Realtime payload into the current row Map -- the actual state-update
 * logic behind the `.on('postgres_changes', ...)` handler, extracted so the mapRow/partial-
 * payload behavior (the bug this file's doc comment describes finding) can be unit-tested
 * directly against plain objects, without a real Supabase channel or React state.
 *
 * `orderKeyOf` (optional): guards against an OLDER update overwriting a NEWER one already in the
 * Map. For a single postgres_changes subscription this shouldn't normally happen (Postgres
 * replicates in commit order over one TCP-ordered connection), but the reconnect resync path
 * (below) awaits a separate full fetch that can legitimately resolve with data older than a live
 * event that arrived while it was in flight -- without this guard, that late-resolving fetch
 * would silently roll a row backward. When provided (e.g. `(row) => row.version` for `customers`,
 * a value that strictly increases on every write), an incoming row is only applied if its key is
 * >= the existing entry's. */
export function applyRealtimePayload<T extends Record<string, any>>(
  prev: Map<string, T>,
  payload: { eventType: string; new: any; old: any },
  keyOf: (row: T) => string,
  mapRow?: (raw: any, previous: T | undefined) => T,
  orderKeyOf?: (row: T) => number
): Map<string, T> {
  const next = new Map(prev);
  if (payload.eventType === 'DELETE') {
    const oldRow = payload.old as T | undefined;
    if (oldRow) next.delete(keyOf(oldRow));
  } else {
    const key = keyOf(payload.new as T);
    const row = mapRow ? mapRow(payload.new, prev.get(key)) : (payload.new as T);
    if (orderKeyOf) {
      const existing = prev.get(key);
      if (existing && orderKeyOf(row) < orderKeyOf(existing)) return prev; // stale -- ignore
    }
    next.set(key, row);
  }
  return next;
}

/** Generic Realtime subscription for a small, unfiltered table (product_health_snapshot,
 * variant_sku_index, customers, cart_events, order_status_log) -- unlike
 * useInventorySnapshotSync/useLiveInventoryTable, this doesn't filter by ids, since these tables
 * are already small (bounded by product/variant/customer count, not inventory-check-event volume)
 * and every row matters to at least one Dashboard/Customers widget. Holds the full row set keyed
 * by the given primary key field, applying INSERT/UPDATE/DELETE events as they arrive.
 * `initialRows` seeds it so the page shows correct data even before any Realtime event has fired.
 *
 * Handles silent disconnection (confirmed against Supabase's own troubleshooting docs: a
 * backgrounded browser tab gets its JS timers throttled, the client can't heartbeat in time, and
 * the server drops the connection with no error surfaced to the app) -- `worker: true` avoids
 * most of it by running the heartbeat off the main thread; `heartbeatCallback` catches the rest
 * by forcing a reconnect (with a freshly-fetched auth token, not the one from initial mount,
 * which could be hours stale by the time a reconnect is actually needed). Because Realtime
 * doesn't replay events missed while disconnected, `onReconnect` (if given) is called once after
 * a REAL reconnect (not the very first subscribe) to fully resync from the source of truth
 * instead of trying to reconstruct what was missed from incremental payloads alone.
 *
 * `mapRow` (optional): most callers of this hook keep their row type in raw snake_case DB column
 * names specifically so a Realtime payload (always raw column names) can be applied directly --
 * see e.g. `OrderStatusRow`'s own doc comment. `customers` is the one table whose app-level type
 * (`Customer`) is translated to camelCase, so for that caller `mapRow` (`mapCustomerRow`) must run
 * on every incoming payload before merging it in. Found missing via a live Playwright test
 * (e2e/customers/live-sync.spec.ts) -- without it, every field after the first Realtime update
 * silently went blank (`row.firstName` reading `undefined` off a raw `{ first_name: ... }`
 * payload). Receives the previous Map entry too, so a mapper can carry over anything a raw
 * payload structurally can't contain (e.g. `customers`' joined `sales_reps` name/phone/email).
 */
export function useLiveTable<T extends Record<string, any>>(
  table: string,
  // A single column name for a normal primary key, or a function for a composite one (e.g.
  // cart_snapshot's (customer_id, variant_id) pair) -- either way it must derive the same string
  // for a given row regardless of whether that row came from `initialRows` or a Realtime payload.
  primaryKey: keyof T | ((row: T) => string),
  initialRows: T[],
  onReconnect?: () => Promise<T[]>,
  mapRow?: (raw: any, previous: T | undefined) => T,
  orderKeyOf?: (row: T) => number
): { rows: Map<string, T>; connectionState: LiveTableConnectionState } {
  const keyOf = typeof primaryKey === 'function' ? primaryKey : (row: T) => String(row[primaryKey]);
  const [rows, setRows] = useState<Map<string, T>>(() => new Map(initialRows.map((r) => [keyOf(r), r])));
  const [connectionState, setConnectionState] = useState<LiveTableConnectionState>('connected');

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>['channel']> | null = null;
    let hasSubscribedOnce = false;
    let reconnecting = false;

    const supabase = createSupabaseBrowserClient({
      realtime: {
        worker: true,
        heartbeatCallback: async (status: string) => {
          if (!shouldAttemptReconnect(status, reconnecting) || cancelled) return;
          reconnecting = true;
          setConnectionState('reconnecting');
          try {
            // Fresh token, not the one captured at initial mount -- a tab can realistically stay
            // open for hours, long enough for that original token to have expired.
            const { data } = await supabase.auth.getSession();
            if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
            await supabase.realtime.connect();
          } finally {
            reconnecting = false;
          }
        },
      },
    });

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
          setRows((prev) => applyRealtimePayload(prev, payload as any, keyOf, mapRow, orderKeyOf));
        })
        .subscribe(async (status) => {
          if (cancelled) return;
          if (shouldResyncOnSubscribe(status, hasSubscribedOnce, Boolean(onReconnect))) {
            // A real reconnect, not the first subscribe -- an incremental payload has no way to
            // know what was missed while disconnected, so resync fully instead of guessing.
            try {
              const fresh = await onReconnect!();
              if (!cancelled) {
                setRows((prev) => {
                  // Same staleness guard as the live-event path, for the same reason: this fetch
                  // was in flight for a while, and a live event for some row may have arrived (and
                  // already been applied to `prev`) more recently than this fetch's snapshot of
                  // that row -- keep whichever is actually newer per row, not a blanket replace.
                  const next = new Map<string, T>();
                  for (const row of fresh) {
                    const key = keyOf(row);
                    const existing = prev.get(key);
                    const useExisting = orderKeyOf && existing && orderKeyOf(existing) > orderKeyOf(row);
                    next.set(key, useExisting ? existing : row);
                  }
                  return next;
                });
              }
            } catch (err) {
              console.error(`[useLiveTable:${table}] reconnect resync failed:`, err);
            }
          }
          if (status !== 'SUBSCRIBED') return;
          hasSubscribedOnce = true;
          setConnectionState('connected');
        });
    }
    setupSubscription();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  return { rows, connectionState };
}
