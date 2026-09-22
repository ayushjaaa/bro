'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Customer, OrderStatusRow } from '@/data/customers';
import type { SalesRep } from '@/data/sales-reps';
import { approveCustomerAction, rejectCustomerAction, updateCustomerSalesRepAction } from '../actions';
import { useLiveTable } from '@/features/dashboard/hooks/useLiveTable';
import { StatusBadge } from './shared';
import CustomerDrawer from './CustomerDrawer';
import CustomersBySalesRep from './CustomersBySalesRep';

/** Unified Customers screen (design decision: item 38) -- pending and approved rows live in
 * one table, not separate pages. Clicking a row opens a slide-over `CustomerDrawer` with every
 * registration field, order history, assigned sales rep, and internal notes grouped into
 * clearly bounded cards -- replacing the old inline `<tr>` expand, which stacked all of that
 * in one continuous unlabeled column (see the Customers-page redesign plan for the full
 * rationale). Cart contents live on their own page (/cart), not nested in here.
 */
export default function CustomersTable({
  customers,
  initialOrderStatusLog,
  salesReps,
  noteCounts,
}: {
  customers: Customer[];
  initialOrderStatusLog: OrderStatusRow[];
  salesReps: SalesRep[];
  /** Serialized as entries, not a Map -- same reasoning as CustomerCartsPageResult's
   * productTitles (actions.ts): keeps the Server Component -> Client Component boundary in the
   * safest common shape. */
  noteCounts: Array<[string, number]>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'all' | 'byRep'>('all');

  const orderStatusLog = useLiveTable('order_status_log', 'id', initialOrderStatusLog);
  const noteCountMap = new Map(noteCounts);

  if (customers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
        No customers yet.
      </div>
    );
  }

  const selectedCustomer = customers.find((c) => c.id === selectedId) ?? null;
  const selectedOrders = selectedCustomer?.shopifyCustomerId
    ? [...orderStatusLog.values()].filter((row) => row.customer_id === selectedCustomer.shopifyCustomerId)
    : [];

  return (
    <>
      <div className="mb-3 inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
        <button
          type="button"
          onClick={() => setView('all')}
          className={`text-xs font-medium px-3 py-1.5 rounded-md ${
            view === 'all' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          All Customers
        </button>
        <button
          type="button"
          onClick={() => setView('byRep')}
          className={`text-xs font-medium px-3 py-1.5 rounded-md ${
            view === 'byRep' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          By Sales Rep
        </button>
      </div>

      {view === 'all' ? (
        <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
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
                  onSelect={() => setSelectedId(c.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <CustomersBySalesRep customers={customers} salesReps={salesReps} onSelect={setSelectedId} />
      )}

      {selectedCustomer && (
        <CustomerDrawer
          customer={selectedCustomer}
          orders={selectedOrders}
          salesReps={salesReps}
          onClose={() => setSelectedId(null)}
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
  onSelect: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState('');
  const router = useRouter();

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
        setRowError('Could not approve. Please try again.');
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
        setRowError('Could not reject. Please try again.');
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
        setRowError('Could not assign the rep. Please try again.');
      }
    });
  }

  return (
    <tr className="hover:bg-neutral-50 cursor-pointer" onClick={onSelect}>
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
      <td className="px-4 py-2.5 text-neutral-600 capitalize">{customer.accountType}</td>
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
              className="text-xs font-semibold px-2.5 py-1 rounded-full border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Reject
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSelect}
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
