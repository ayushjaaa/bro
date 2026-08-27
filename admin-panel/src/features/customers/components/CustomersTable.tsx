'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Customer, CartSnapshotRow, OrderStatusRow } from '@/data/customers';
import { approveCustomerAction, rejectCustomerAction, updateAccountTypeAction } from '../actions';
import { useLiveTable } from '@/features/dashboard/hooks/useLiveTable';

/** Unified expandable Customers screen (design decision: item 38) -- pending and approved rows
 * live in one table, not separate pages. Collapsed row = name + business name + the
 * status-appropriate action; expanding reveals every registration field, an account-type switch
 * for already-approved rows, and (per user request) that customer's current cart contents +
 * order history -- so an admin can see at a glance "what did they add, and did they ever order."
 */
export default function CustomersTable({
  customers,
  initialCartSnapshot,
  initialOrderStatusLog,
}: {
  customers: Customer[];
  initialCartSnapshot: CartSnapshotRow[];
  initialOrderStatusLog: OrderStatusRow[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Subscribed ONCE here (not per-row) to avoid opening N Realtime channels for N customer rows --
  // each row below just filters this shared live data down to its own shopifyCustomerId.
  const cartSnapshot = useLiveTable(
    'cart_snapshot',
    (r: CartSnapshotRow) => `${r.customer_id}:${r.variant_id}`,
    initialCartSnapshot
  );
  const orderStatusLog = useLiveTable('order_status_log', 'id', initialOrderStatusLog);

  if (customers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
        No customers yet.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Name</th>
            <th className="text-left px-4 py-2 font-medium">Business</th>
            <th className="text-left px-4 py-2 font-medium">Type</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-left px-4 py-2 font-medium">Requested</th>
            <th className="text-left px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {customers.map((c) => {
            const cartItems = c.shopifyCustomerId
              ? [...cartSnapshot.values()].filter((row) => row.customer_id === c.shopifyCustomerId)
              : [];
            const orders = c.shopifyCustomerId
              ? [...orderStatusLog.values()].filter((row) => row.customer_id === c.shopifyCustomerId)
              : [];
            return (
              <CustomerRow
                key={c.id}
                customer={c}
                cartItems={cartItems}
                orders={orders}
                expanded={expandedId === c.id}
                onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CustomerRow({
  customer,
  cartItems,
  orders,
  expanded,
  onToggle,
}: {
  customer: Customer;
  cartItems: CartSnapshotRow[];
  orders: OrderStatusRow[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleApprove() {
    if (!confirm(`Approve ${customer.firstName} ${customer.lastName}? This grants real account access.`)) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set('id', customer.id);
      await approveCustomerAction(formData);
      router.refresh();
    });
  }

  function handleReject() {
    if (!confirm(`Reject ${customer.firstName} ${customer.lastName}'s request?`)) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set('id', customer.id);
      await rejectCustomerAction(formData);
      router.refresh();
    });
  }

  function handleAccountTypeChange(accountType: 'retail' | 'wholesale') {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('id', customer.id);
      formData.set('accountType', accountType);
      await updateAccountTypeAction(formData);
      router.refresh();
    });
  }

  // Group order_status_log rows by order_id, keeping only the most recent status per order --
  // same "latest wins" logic as the funnel calculation (src/data/funnel.ts).
  const latestByOrder = new Map<string, OrderStatusRow>();
  for (const row of [...orders].sort((a, b) => b.changed_at.localeCompare(a.changed_at))) {
    if (!latestByOrder.has(row.order_id)) latestByOrder.set(row.order_id, row);
  }
  const hasOrdered = [...latestByOrder.keys()].some((id) => id.includes('/Order/'));

  return (
    <>
      <tr className="hover:bg-neutral-50 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2.5 text-neutral-800">
          {customer.firstName} {customer.lastName}
        </td>
        <td className="px-4 py-2.5 text-neutral-600">{customer.businessName ?? '—'}</td>
        <td className="px-4 py-2.5 text-neutral-600 capitalize">{customer.accountType}</td>
        <td className="px-4 py-2.5">
          <StatusBadge status={customer.status} />
        </td>
        <td className="px-4 py-2.5 text-neutral-500 text-xs">
          {new Date(customer.requestedAt).toLocaleDateString('en-CA')}
        </td>
        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
          {customer.status === 'pending' ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleApprove}
                disabled={pending}
                className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-40"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={pending}
                className="text-xs font-medium text-red-700 hover:underline disabled:opacity-40"
              >
                Reject
              </button>
            </div>
          ) : (
            <span className="text-xs text-neutral-400">{expanded ? '▲' : '▼'} details</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-neutral-50/60">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <Field label="Email" value={customer.email} />
              <Field label="Phone" value={customer.phone} />
              <Field label="Business Name" value={customer.businessName} />
              <Field label="Business Registration #" value={customer.businessRegistrationNumber} />
              <Field label="PST Number" value={customer.pstNumber} />
              <Field label="VPT Number" value={customer.vptNumber} />
              <Field label="Type of Business" value={customer.typeOfBusiness} />
              <Field label="License Number" value={customer.licenseNumber} />
              {customer.status === 'approved' && (
                <Field label="Approved" value={`${customer.approvedBy ?? '—'} on ${customer.approvedAt ? new Date(customer.approvedAt).toLocaleDateString('en-CA') : '—'}`} />
              )}
            </div>

            {customer.status === 'approved' && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs text-neutral-500">Account type:</span>
                {(['retail', 'wholesale'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleAccountTypeChange(type)}
                    disabled={pending}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${
                      customer.accountType === type
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}

            {customer.shopifyCustomerId && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-1.5">
                    Current Cart {cartItems.length > 0 && `(${cartItems.length})`}
                  </h3>
                  {cartItems.length === 0 ? (
                    <p className="text-xs text-neutral-400">Cart is empty.</p>
                  ) : (
                    <ul className="text-xs flex flex-col gap-1">
                      {cartItems.map((item) => (
                        <li key={item.variant_id} className="flex items-center justify-between text-neutral-700">
                          <span>{item.product_id.split('/').pop()}</span>
                          <span className="text-neutral-400">
                            ×{item.quantity} · {new Date(item.updated_at).toLocaleString('en-CA')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-1.5">
                    Orders {hasOrdered ? '✓ has ordered' : '— never ordered'}
                  </h3>
                  {latestByOrder.size === 0 ? (
                    <p className="text-xs text-neutral-400">No order requests yet.</p>
                  ) : (
                    <ul className="text-xs flex flex-col gap-1">
                      {[...latestByOrder.values()].map((o) => (
                        <li key={o.order_id} className="flex items-center justify-between text-neutral-700">
                          <span>{o.order_id.includes('/DraftOrder/') ? 'Draft' : 'Order'} {o.order_id.split('/').pop()}</span>
                          <span className="text-neutral-400">
                            {o.new_status} · {new Date(o.changed_at).toLocaleString('en-CA')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-neutral-400 text-xs">{label}</dt>
      <dd className="text-neutral-800">{value || '—'}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: Customer['status'] }) {
  const styles = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-neutral-100 text-neutral-500 border-neutral-200',
  }[status];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${styles}`}>{status}</span>
  );
}
