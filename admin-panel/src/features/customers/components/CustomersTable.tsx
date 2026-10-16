'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Customer, OrderStatusRow } from '@/data/customers';
import { CUSTOMERS_PAGE_SIZE } from '../constants';
import type { SalesRep } from '@/data/sales-reps';
import {
  approveCustomerAction,
  rejectCustomerAction,
  reactivateCustomerAction,
  resetRejectedCustomerForReapplyAction,
  updateCustomerSalesRepAction,
  forceResetStuckApprovalAction,
  getCustomersPageAction,
  getApprovedCustomersForRepViewAction,
} from '../actions';
import { useLiveTable } from '@/features/dashboard/hooks/useLiveTable';
import { mapCustomerRow } from '@/lib/customer-row-mapper';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isAuthError, SESSION_EXPIRED_MESSAGE } from '@/lib/action-errors';
import { StatusBadge } from './shared';
import CustomerDrawer from './CustomerDrawer';
import CustomersBySalesRep from './CustomersBySalesRep';

/** How long to wait after a Realtime change on `customers` before refetching the current page --
 * avoids re-running the paginated query on every rapid-fire change (same pattern/constant value
 * as CartOverview.tsx's LIVE_REFRESH_DEBOUNCE_MS for cart_snapshot). */
const LIVE_REFRESH_DEBOUNCE_MS = 500;

/** A customer is only offered the manual "stuck" escape hatch once it's been sitting in
 * 'approving' well past how long a real Shopify call could plausibly take (normally sub-second)
 * -- see 030 migration / plan doc for why this is a manual, human-confirmed action rather than an
 * automatic timeout-based reclaim. */
const STUCK_APPROVING_THRESHOLD_MS = 5 * 60 * 1000;

/** Display labels only -- the stored/coded account type value stays 'retail'/'wholesale'. */
const ACCOUNT_TYPE_LABELS: Record<'retail' | 'wholesale', string> = {
  retail: 'Distributor',
  wholesale: 'Wholesale',
};

/** Unified Customers screen (design decision: item 38) -- pending and approved rows live in
 * one table, not separate pages. Clicking a row opens a slide-over `CustomerDrawer` with every
 * registration field, order history, assigned sales rep, and internal notes grouped into
 * clearly bounded cards -- replacing the old inline `<tr>` expand, which stacked all of that
 * in one continuous unlabeled column (see the Customers-page redesign plan for the full
 * rationale). Cart contents live on their own page (/cart), not nested in here.
 */
export default function CustomersTable({
  initialCustomers,
  initialTotalCount,
  initialOrderStatusLog,
  salesReps,
  noteCounts,
  salesRepsFailed = false,
  noteCountsFailed = false,
}: {
  initialCustomers: Customer[];
  initialTotalCount: number;
  initialOrderStatusLog: OrderStatusRow[];
  salesReps: SalesRep[];
  /** Serialized as entries, not a Map -- same reasoning as CustomerCartsPageResult's
   * productTitles (actions.ts): keeps the Server Component -> Client Component boundary in the
   * safest common shape. */
  noteCounts: Array<[string, number]>;
  /** True when page.tsx's listSalesReps()/listNoteCountsFor() calls failed and degraded to an
   * empty list/map rather than breaking the page -- without this, that degrade is invisible to
   * the admin, who sees an empty sales-rep dropdown or zero note counts with no indication it's
   * a load failure rather than genuinely "no data". */
  salesRepsFailed?: boolean;
  noteCountsFailed?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Set alongside selectedId when a row's Suspend/Deactivate quick-action is clicked, so the
  // drawer opens straight to that action's reason form instead of just the read-only view --
  // Suspend/Deactivate need a mandatory free-text reason that a bare confirm() can't collect, so
  // the table row is only a shortcut into the drawer, never a bare one-click action for these two.
  const [drawerIntent, setDrawerIntent] = useState<'suspend' | 'deactivate' | null>(null);
  const [view, setView] = useState<'all' | 'byRep'>('all');

  // "By Sales Rep" needs the complete approved-customer set (not just whatever page of the main
  // table is loaded), but fetched lazily -- only once this tab is actually opened -- rather than
  // eagerly alongside the main paginated fetch on every /customers load. Most admin visits never
  // open this tab, so eager-fetching it would undercut the whole point of paginating the main
  // table (confirmed live this session: it was adding a full extra round trip to every load).
  const [approvedForRepView, setApprovedForRepView] = useState<Customer[] | null>(null);
  const [repViewLoading, setRepViewLoading] = useState(false);
  const [repViewError, setRepViewError] = useState('');

  function selectView(next: 'all' | 'byRep') {
    setView(next);
    if (next === 'byRep' && approvedForRepView === null && !repViewLoading) {
      setRepViewLoading(true);
      setRepViewError('');
      getApprovedCustomersForRepViewAction()
        .then((response) => {
          if (!response.ok) {
            setRepViewError(isAuthError(response.error) ? SESSION_EXPIRED_MESSAGE : response.error);
            return;
          }
          setApprovedForRepView(response.customers);
        })
        .catch((err) => {
          console.error('[CustomersTable] getApprovedCustomersForRepViewAction failed:', err);
          setRepViewError('Could not load approved customers. Please try again.');
        })
        .finally(() => setRepViewLoading(false));
    }
  }

  function openDrawer(id: string, intent: 'suspend' | 'deactivate' | null = null) {
    setSelectedId(id);
    setDrawerIntent(intent);
  }

  const { rows: orderStatusLog } = useLiveTable('order_status_log', 'id', initialOrderStatusLog);

  // Main table pagination state. Deliberately NOT useLiveTable here (unlike order_status_log
  // above) -- useLiveTable merges every postgres_changes event for a table unconditionally into
  // its Map with no row/page filter, which would inject out-of-page rows (e.g. a brand-new
  // pending registration landing on whatever page happens to be open). Instead this follows
  // CartOverview.tsx's proven pattern for its own paginated cart list: any change to the table
  // triggers a debounced refetch of whatever page is currently showing, never a raw-event merge.
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState(initialCustomers);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [currentNoteCounts, setCurrentNoteCounts] = useState(new Map(noteCounts));
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const pageCount = Math.max(1, Math.ceil(totalCount / CUSTOMERS_PAGE_SIZE));

  // Same stale-response race guard as CartOverview.tsx's fetchPage -- a slow earlier page fetch
  // resolving after a newer one would otherwise silently overwrite the correct, already-rendered
  // page with stale data.
  const latestRequestIdRef = useRef(0);
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  async function fetchPage(nextPage: number) {
    const requestId = ++latestRequestIdRef.current;
    setIsLoading(true);
    setFetchError('');
    try {
      const response = await getCustomersPageAction({ page: nextPage, pageSize: CUSTOMERS_PAGE_SIZE });
      if (requestId !== latestRequestIdRef.current) return;
      if (!response.ok) {
        setFetchError(isAuthError(response.error) ? SESSION_EXPIRED_MESSAGE : response.error);
        return;
      }
      setCustomers(response.customers);
      setTotalCount(response.totalCount);
      setCurrentNoteCounts(new Map(response.noteCounts));
    } catch (err) {
      if (requestId !== latestRequestIdRef.current) return;
      console.error('[CustomersTable] fetchPage failed:', err);
      setFetchError('Could not load customers. Please try again.');
    } finally {
      if (requestId === latestRequestIdRef.current) setIsLoading(false);
    }
  }

  function goToPage(next: number) {
    setPage(next);
    fetchPage(next);
  }

  // Mirrors `approvedForRepView` so the realtime effect below (set up once) can check "has the By
  // Sales Rep tab been opened at least once" without needing it in its dependency array.
  const approvedForRepViewLoadedRef = useRef(false);
  useEffect(() => {
    approvedForRepViewLoadedRef.current = approvedForRepView !== null;
  }, [approvedForRepView]);

  function refreshRepView() {
    getApprovedCustomersForRepViewAction()
      .then((response) => {
        if (response.ok) setApprovedForRepView(response.customers);
      })
      .catch((err) => console.error('[CustomersTable] refreshRepView failed:', err));
  }

  // UPDATE is the common case -- every approve/reject/suspend/deactivate/reactivate/assign-rep/
  // edit-info action is an UPDATE on a row that already exists somewhere in the table. Patches
  // that ONE row in place, straight from the payload's `new` data (REPLICA IDENTITY FULL is
  // confirmed set on this table, so `payload.new` always carries every column, not just the
  // changed ones -- verified live this session) -- zero extra network round trip, and completely
  // harmless if the row isn't on the page currently showing (the `.map()` below is then a no-op).
  // `version` strictly increases on every write (same guard the old useLiveTable usage relied on
  // via its `orderKeyOf` parameter), so an out-of-order/replayed event can never roll a row
  // backward to stale data.
  function patchRowInPlace(newRow: Record<string, unknown>) {
    const mapped = mapCustomerRow(newRow);
    setCustomers((prev) => prev.map((c) => (c.id === mapped.id && mapped.version >= c.version ? mapped : c)));
    // approvedForRepView only ever holds 'approved' rows (listApprovedCustomersForRepView's own
    // server-side filter) -- a plain `.map()` here would leave a row that just left 'approved'
    // (e.g. got suspended) stuck showing under its old rep forever, and would never add a row that
    // just BECAME 'approved' (e.g. a pending application finally approved) until the tab is
    // closed and reopened. Found by deliberately re-examining this patch for exactly this gap
    // after shipping the zero-round-trip version -- membership in this list has to be
    // re-evaluated on every patch, not just the fields of rows already in it.
    setApprovedForRepView((prev) => {
      if (prev === null) return prev;
      const exists = prev.some((c) => c.id === mapped.id);
      if (mapped.status === 'approved') {
        if (exists) return prev.map((c) => (c.id === mapped.id && mapped.version >= c.version ? mapped : c));
        return [mapped, ...prev];
      }
      return exists ? prev.filter((c) => c.id !== mapped.id) : prev;
    });
  }

  // INSERT/DELETE change `totalCount` and can shift page boundaries (e.g. a brand-new pending
  // registration, or a reapply-reset deleting a row) -- those are rare compared to the UPDATE
  // case above, so falling back to a full refetch of the current page (bounded to just
  // CUSTOMERS_PAGE_SIZE rows, never the whole table) is an acceptable trade-off for correctness,
  // same reasoning CartOverview.tsx's own cart_snapshot listener uses for ITS paginated list.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    async function setup() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel(`customers-live-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            patchRowInPlace(payload.new as Record<string, unknown>);
            return;
          }
          // INSERT or DELETE -- debounced full refetch (rare path).
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            fetchPage(pageRef.current);
            if (approvedForRepViewLoadedRef.current) refreshRepView();
          }, LIVE_REFRESH_DEBOUNCE_MS);
        })
        .subscribe();
    }
    setup();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const noteCountMap = currentNoteCounts;

  if (customers.length === 0 && totalCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
        No customers yet.
      </div>
    );
  }

  // The drawer can be opened from either the paginated main table or the full-list "By Sales Rep"
  // view -- look the selected id up in whichever source actually has it.
  const selectedCustomer =
    customers.find((c) => c.id === selectedId) ?? (approvedForRepView ?? []).find((c) => c.id === selectedId) ?? null;
  const selectedOrders = selectedCustomer?.shopifyCustomerId
    ? [...orderStatusLog.values()].filter((row) => row.customer_id === selectedCustomer.shopifyCustomerId)
    : [];

  return (
    <>
      {fetchError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {fetchError}{' '}
          <button type="button" onClick={() => fetchPage(page)} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}
      {(salesRepsFailed || noteCountsFailed) && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
          {salesRepsFailed && noteCountsFailed
            ? 'Could not load sales reps or internal note counts — the dropdown and note badges below may be incomplete. Reload the page to retry.'
            : salesRepsFailed
              ? 'Could not load the sales rep list — the assignment dropdown below may be empty or incomplete. Reload the page to retry.'
              : 'Could not load internal note counts — the badges below may be missing. Reload the page to retry.'}
        </div>
      )}
      <div className="mb-3 inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
        <button
          type="button"
          onClick={() => selectView('all')}
          className={`text-xs font-medium px-3 py-1.5 rounded-md ${
            view === 'all' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          All Customers
        </button>
        <button
          type="button"
          onClick={() => selectView('byRep')}
          className={`text-xs font-medium px-3 py-1.5 rounded-md ${
            view === 'byRep' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          By Sales Rep
        </button>
      </div>

      {view === 'all' ? (
        <>
          <div
            className={`rounded-lg border border-neutral-200 bg-white overflow-hidden transition-opacity ${isLoading ? 'opacity-60' : ''}`}
          >
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Business</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Sales Rep</th>
                  <th className="text-left px-4 py-2 font-medium">Account #</th>
                  <th className="text-left px-4 py-2 font-medium">Requested</th>
                  <th className="text-left px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {customers.map((c) => (
                  <CustomerTableRow
                    key={c.id}
                    customer={c}
                    salesReps={salesReps}
                    noteCount={noteCountMap.get(c.id) ?? 0}
                    onSelect={(intent) => openDrawer(c.id, intent)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {totalCount > 0 && pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
              <span className="text-neutral-500">
                Page {page} of {pageCount} ({totalCount} customer{totalCount === 1 ? '' : 's'})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToPage(Math.max(1, page - 1))}
                  disabled={page <= 1 || isLoading}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(Math.min(pageCount, page + 1))}
                  disabled={page >= pageCount || isLoading}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : repViewError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {repViewError}{' '}
          <button type="button" onClick={() => selectView('byRep')} className="font-semibold underline">
            Retry
          </button>
        </div>
      ) : repViewLoading || approvedForRepView === null ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          Loading…
        </div>
      ) : (
        <CustomersBySalesRep customers={approvedForRepView} salesReps={salesReps} onSelect={setSelectedId} />
      )}

      {selectedCustomer && (
        <CustomerDrawer
          customer={selectedCustomer}
          orders={selectedOrders}
          salesReps={salesReps}
          initialIntent={drawerIntent}
          onClose={() => {
            setSelectedId(null);
            setDrawerIntent(null);
          }}
        />
      )}
    </>
  );
}

function CustomerTableRow({
  customer,
  salesReps,
  noteCount,
  onSelect,
}: {
  customer: Customer;
  salesReps: SalesRep[];
  noteCount: number;
  onSelect: (intent?: 'suspend' | 'deactivate') => void;
}) {
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState('');
  const router = useRouter();

  // Session expiry (requireAdmin() throwing mid-action) must read differently from a real
  // business failure -- otherwise an admin whose session lapsed keeps clicking a button that can
  // never succeed until they reload and log in again, with the UI giving no hint why.
  function resolveErrorMessage(err: unknown, fallback: string): string {
    const message = err instanceof Error ? err.message : undefined;
    if (isAuthError(message)) return SESSION_EXPIRED_MESSAGE;
    return message || fallback;
  }

  // C5: none of these three were wrapped in try/catch -- an awaited throw inside an async
  // startTransition callback is NOT a render-phase error, so no Error Boundary catches it. It's
  // just a silent unhandled rejection: `pending` still resolves to false (button re-enables) but
  // `router.refresh()` never runs, so the row silently keeps its stale state with zero error shown
  // -- the admin believes they approved/rejected/reassigned a customer but nothing happened.
  function handleApprove() {
    if (!confirm(`Approve ${customer.firstName} ${customer.lastName}? This grants real account access.`)) return;
    setRowError('');
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('id', customer.id);
        await approveCustomerAction(formData);
        router.refresh();
      } catch (err) {
        console.error('[CustomersTable] handleApprove failed:', err);
        // 030: customers.ts's approveCustomer() already sanitizes every error it throws into an
        // admin-safe message (e.g. "already decided/being processed" when a race guard fires) --
        // show it as-is instead of a generic fallback, so a losing admin understands what
        // happened instead of just seeing an opaque failure.
        setRowError(resolveErrorMessage(err, 'Could not approve. Please try again.'));
      }
    });
  }

  function handleReject() {
    if (!confirm(`Reject ${customer.firstName} ${customer.lastName}'s request?`)) return;
    setRowError('');
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('id', customer.id);
        await rejectCustomerAction(formData);
        router.refresh();
      } catch (err) {
        console.error('[CustomersTable] handleReject failed:', err);
        setRowError(resolveErrorMessage(err, 'Could not reject. Please try again.'));
      }
    });
  }

  function handleForceReset() {
    if (!confirm(`This will reset ${customer.firstName} ${customer.lastName} back to pending, in case approval got stuck. Continue?`)) return;
    setRowError('');
    startTransition(async () => {
      try {
        await forceResetStuckApprovalAction(customer.id);
        router.refresh();
      } catch (err) {
        console.error('[CustomersTable] handleForceReset failed:', err);
        setRowError(resolveErrorMessage(err, 'Could not reset. Please try again.'));
      }
    });
  }

  function handleReactivate() {
    if (!confirm(`Reactivate ${customer.firstName} ${customer.lastName}? They'll be able to log in again immediately, no data lost.`)) return;
    setRowError('');
    startTransition(async () => {
      try {
        await reactivateCustomerAction(customer.id);
        router.refresh();
      } catch (err) {
        console.error('[CustomersTable] handleReactivate failed:', err);
        setRowError(resolveErrorMessage(err, 'Could not reactivate. Please try again.'));
      }
    });
  }

  function handleAllowReapply() {
    if (!confirm(`This clears ${customer.firstName} ${customer.lastName}'s submitted application so they can reapply from scratch with the same email. Continue?`)) return;
    setRowError('');
    startTransition(async () => {
      try {
        await resetRejectedCustomerForReapplyAction(customer.id);
        router.refresh();
      } catch (err) {
        console.error('[CustomersTable] handleAllowReapply failed:', err);
        const message = resolveErrorMessage(err, 'Could not reset for reapplication. Please try again.');
        setRowError(message);
        // Unlike Suspend/Deactivate/Reactivate, this action's own success DELETES its row -- if
        // another admin already won this race, the live table's realtime sync can remove this
        // row (and the rowError text with it) before the admin ever sees it, since the row
        // genuinely no longer exists server-side. alert() guarantees the message survives even
        // if the row's own DOM node is gone by the time this runs (found via a live concurrency
        // e2e test: the row disappeared with zero explanation of why the click failed).
        alert(message);
      }
    });
  }

  function handleAssignRep(salesRepId: string) {
    setRowError('');
    startTransition(async () => {
      try {
        await updateCustomerSalesRepAction(customer.id, salesRepId || null);
        router.refresh();
      } catch (err) {
        console.error('[CustomersTable] handleAssignRep failed:', err);
        setRowError(resolveErrorMessage(err, 'Could not assign the rep. Please try again.'));
      }
    });
  }

  return (
    <tr
      data-testid={`customer-row-${customer.id}`}
      className="hover:bg-neutral-50 cursor-pointer"
      onClick={() => onSelect()}
    >
      <td className="px-4 py-2.5 text-neutral-800">
        <span className="inline-flex items-center gap-1.5">
          {customer.firstName} {customer.lastName}
          {/* Visibility: staff shouldn't have to open the drawer to know internal notes exist
              -- only rendered when count > 0 (Highlighting: if everything's highlighted,
              nothing is). */}
          {noteCount > 0 && (
            <span
              title={`${noteCount} internal note${noteCount === 1 ? '' : 's'}`}
              className="inline-flex items-center justify-center size-4.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold"
            >
              {noteCount}
            </span>
          )}
        </span>
      </td>
      <td className="px-4 py-2.5 text-neutral-600">{customer.businessName ?? '—'}</td>
      <td className="px-4 py-2.5 text-neutral-600">{ACCOUNT_TYPE_LABELS[customer.accountType]}</td>
      <td className="px-4 py-2.5">
        <StatusBadge status={customer.status} />
      </td>
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        {/* Assigning a rep only makes sense once someone is a real approved account -- pending
            requests aren't customers yet, and rejected ones never become one. */}
        {customer.status === 'approved' ? (
          <select
            value={customer.salesRepId ?? ''}
            onChange={(e) => handleAssignRep(e.target.value)}
            disabled={pending}
            className={`text-xs rounded-full border px-2 py-1 max-w-36 truncate ${
              customer.salesRep
                ? 'border-neutral-200 bg-neutral-100 font-medium text-neutral-700'
                : 'border-dashed border-neutral-300 text-neutral-400'
            }`}
          >
            <option value="">Unassigned</option>
            {salesReps.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-neutral-300">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-neutral-600 font-mono text-xs">{customer.accountNumber ?? '—'}</td>
      <td className="px-4 py-2.5 text-neutral-500 text-xs">
        {new Date(customer.requestedAt).toLocaleDateString('en-CA')}
      </td>
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        {customer.status === 'pending' ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleApprove}
              disabled={pending}
              className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600"
            >
              {pending ? '…' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={pending}
              className="text-xs font-semibold px-2.5 py-1 rounded-full border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Reject
            </button>
            {/* Suspend works before approval too (034, product decision): an obviously fraudulent
                applicant shouldn't have to be approved first just to then be suspended. Needs a
                mandatory reason, so this opens the drawer's form like the approved row's Suspend
                does, rather than acting inline. Solid red (not Reject's lighter rose outline) --
                this one action is permanent and un-reversible, so it must read as more severe than
                every other button at a glance, not share a color family with a routine Reject. */}
            <button
              type="button"
              onClick={() => onSelect('suspend')}
              className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-600 text-white hover:bg-red-700"
            >
              Suspend
            </button>
          </div>
        ) : customer.status === 'approving' &&
          Date.now() - new Date(customer.updatedAt).getTime() > STUCK_APPROVING_THRESHOLD_MS ? (
          // Manual escape hatch (030 migration / plan doc) -- only shown once a row has been
          // 'approving' far longer than a real Shopify call could plausibly take, so this never
          // appears during a normal, in-flight approval.
          <button
            type="button"
            onClick={handleForceReset}
            disabled={pending}
            className="text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-40"
          >
            {pending ? '…' : 'Reset stuck approval'}
          </button>
        ) : customer.status === 'approved' ? (
          // Suspend/Deactivate both need a mandatory reason a bare confirm() can't collect --
          // these open the drawer's "Account Status Actions" card instead of acting inline (034).
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onSelect('suspend')}
              className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-600 text-white hover:bg-red-700"
            >
              Suspend
            </button>
            <button
              type="button"
              onClick={() => onSelect('deactivate')}
              className="text-xs font-semibold px-2.5 py-1 rounded-full border border-orange-200 text-orange-700 hover:bg-orange-50"
            >
              Deactivate
            </button>
          </div>
        ) : customer.status === 'deactivated' ? (
          // Blue, not Approve's green -- Reactivate is "undo a pause," a materially different
          // action from "approve a brand-new application," and the two buttons never appear on
          // the same row, but keeping them visually distinct avoids a learned "green = approve"
          // reflex misfiring here.
          <button
            type="button"
            onClick={handleReactivate}
            disabled={pending}
            className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600"
          >
            {pending ? '…' : 'Reactivate'}
          </button>
        ) : customer.status === 'rejected' ? (
          <button
            type="button"
            onClick={handleAllowReapply}
            disabled={pending}
            className="text-xs font-semibold px-2.5 py-1 rounded-full border border-violet-300 text-violet-700 hover:bg-violet-50 disabled:opacity-40"
          >
            {pending ? '…' : 'Allow reapply'}
          </button>
        ) : (
          // 'suspended' lands here too, deliberately -- no action buttons at all, reinforcing the
          // permanent dead end at the table level, not just in the drawer.
          <button
            type="button"
            onClick={() => onSelect()}
            className="text-xs font-medium text-neutral-500 hover:text-brand-purple-deep hover:underline"
          >
            View details
          </button>
        )}
        {rowError && <p className="text-[11px] text-red-600 mt-1">{rowError}</p>}
      </td>
    </tr>
  );
}
