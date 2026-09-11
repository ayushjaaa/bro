'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Customer, OrderStatusRow } from '@/data/customers';
import type { SalesRep } from '@/data/sales-reps';
import type { InternalNote, NoteEntityType } from '@/data/internal-notes';
import {
  approveCustomerAction,
  rejectCustomerAction,
  updateAccountTypeAction,
  getRegistrationDocumentUrlAction,
  updateCustomerSalesRepAction,
  createSalesRepAction,
  listNotesAction,
  createNoteAction,
} from '../actions';
import { useLiveTable } from '@/features/dashboard/hooks/useLiveTable';

/** Unified expandable Customers screen (design decision: item 38) -- pending and approved rows
 * live in one table, not separate pages. Collapsed row = name + business name + the
 * status-appropriate action; expanding reveals every registration field, an account-type switch
 * for already-approved rows, order history, an assigned sales rep, and internal team notes on
 * both the customer and each individual order -- so an admin can see at a glance whether they
 * ever ordered. Cart contents live on their own page (/cart) now, not nested in here -- see that
 * page's doc comment for why (this row also can't cleanly show live cart contents: they're keyed
 * by this app's internal customer id, not `shopifyCustomerId`, which is the only Shopify identifier
 * available here).
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const orderStatusLog = useLiveTable('order_status_log', 'id', initialOrderStatusLog);
  const noteCountMap = new Map(noteCounts);

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
            <th className="text-left px-4 py-2 font-medium">Account #</th>
            <th className="text-left px-4 py-2 font-medium">Requested</th>
            <th className="text-left px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {customers.map((c) => {
            const orders = c.shopifyCustomerId
              ? [...orderStatusLog.values()].filter((row) => row.customer_id === c.shopifyCustomerId)
              : [];
            return (
              <CustomerRow
                key={c.id}
                customer={c}
                orders={orders}
                salesReps={salesReps}
                noteCount={noteCountMap.get(c.id) ?? 0}
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
  orders,
  salesReps,
  noteCount,
  expanded,
  onToggle,
}: {
  customer: Customer;
  orders: OrderStatusRow[];
  salesReps: SalesRep[];
  noteCount: number;
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

  async function handleViewDocument(path: string) {
    const url = await getRegistrationDocumentUrlAction(path);
    window.open(url, '_blank', 'noopener,noreferrer');
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
          <span className="inline-flex items-center gap-1.5">
            {customer.firstName} {customer.lastName}
            {/* Visibility: staff shouldn't have to expand every row to know internal notes
                exist -- only rendered when count > 0 (Highlighting: if everything's
                highlighted, nothing is). */}
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
        <td className="px-4 py-2.5 text-neutral-600 font-mono text-xs">{customer.accountNumber ?? '—'}</td>
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
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <Field label="Email" value={customer.email} />
              <Field label="Business Phone" value={customer.phone} />
              <Field label="Personal Cell" value={customer.personalCell} />
              {customer.status === 'approved' && (
                <>
                  <Field label="Approved" value={`${customer.approvedBy ?? '—'} on ${customer.approvedAt ? new Date(customer.approvedAt).toLocaleDateString('en-CA') : '—'}`} />
                  <Field label="Account Number" value={customer.accountNumber} />
                </>
              )}
            </div>

            {/* Older 005-era fields -- only ever populated for rows created before the real
                registration wizard existed; blank for every new signup, so this section is
                skipped entirely once there's nothing in it. */}
            {(customer.businessRegistrationNumber || customer.pstNumber || customer.vptNumber || customer.typeOfBusiness || customer.licenseNumber) && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <Field label="Business Registration #" value={customer.businessRegistrationNumber} />
                <Field label="PST Number" value={customer.pstNumber} />
                <Field label="VPT Number" value={customer.vptNumber} />
                <Field label="Type of Business" value={customer.typeOfBusiness} />
                <Field label="License Number" value={customer.licenseNumber} />
              </div>
            )}

            <div className="mt-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-1.5">Business Info</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <Field label="Legal Business Name" value={customer.legalBusinessName} />
                <Field label="Operating Name" value={customer.operatingName} />
                <Field label="Business Number" value={customer.businessNumber} />
                <Field label="No of Stores" value={customer.numStores != null ? String(customer.numStores) : null} />
                <Field label="Types of Business" value={customer.businessTypes?.join(', ') ?? null} />
                <Field label="Expected Monthly Purchase" value={customer.monthlyPurchaseRange} />
                <Field label="Instagram" value={customer.instagramHandle} />
                <Field
                  label="Sells Online"
                  value={customer.sellsOnline == null ? null : customer.sellsOnline ? (customer.onlineUrl ?? 'Yes') : 'No'}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-1.5">Shipping Address</h3>
                <p className="text-sm text-neutral-800">
                  {[customer.shipLine1, customer.shipLine2, customer.shipCity, customer.shipProvince, customer.shipPostalCode]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-1.5">Billing Address</h3>
                <p className="text-sm text-neutral-800">
                  {customer.billSameAsShipping
                    ? 'Same as shipping'
                    : [customer.billLine1, customer.billLine2, customer.billCity, customer.billProvince, customer.billPostalCode]
                        .filter(Boolean)
                        .join(', ') || '—'}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-1.5">Documents</h3>
              <div className="flex flex-wrap gap-3 text-sm">
                {customer.businessLicencePath ? (
                  <button
                    type="button"
                    onClick={() => handleViewDocument(customer.businessLicencePath!)}
                    className="text-emerald-700 hover:underline"
                  >
                    View Business/Tax Licence
                  </button>
                ) : (
                  <span className="text-neutral-400">No business licence uploaded</span>
                )}
                {customer.specialtyLicencePath && (
                  <button
                    type="button"
                    onClick={() => handleViewDocument(customer.specialtyLicencePath!)}
                    className="text-emerald-700 hover:underline"
                  >
                    View Specialty Store Licence
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <Field label="Tax Exempt" value={customer.taxExempt == null ? null : customer.taxExempt ? 'Yes' : 'No'} />
              <Field label="How They Heard About Us" value={customer.referralSource} />
              <Field
                label="Signed By"
                value={customer.signatureName ? `${customer.signatureName}${customer.signedAt ? ` on ${new Date(customer.signedAt).toLocaleString('en-CA')}` : ''}` : null}
              />
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

            <SalesRepSection customer={customer} salesReps={salesReps} />

            <div className="mt-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-1.5">Internal Notes</h3>
              <NotesPanel entityType="customer" entityId={customer.id} />
            </div>

            {customer.shopifyCustomerId && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-1.5">
                  Orders {hasOrdered ? '✓ has ordered' : '— never ordered'}
                </h3>
                {latestByOrder.size === 0 ? (
                  <p className="text-xs text-neutral-400">No order requests yet.</p>
                ) : (
                  <ul className="text-xs flex flex-col gap-2 max-w-md">
                    {[...latestByOrder.values()].map((o) => (
                      <OrderLine key={o.order_id} order={o} />
                    ))}
                  </ul>
                )}
                <p className="text-xs text-neutral-400 mt-2">
                  Cart contents live on the <a href="/cart" className="text-emerald-700 hover:underline">Cart</a> page.
                </p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function OrderLine({ order }: { order: OrderStatusRow }) {
  const [showNotes, setShowNotes] = useState(false);
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-neutral-700">
        <span>{order.order_id.includes('/DraftOrder/') ? 'Draft' : 'Order'} {order.order_id.split('/').pop()}</span>
        <div className="flex items-center gap-3">
          <span className="text-neutral-400">
            {order.new_status} · {new Date(order.changed_at).toLocaleString('en-CA')}
          </span>
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="text-emerald-700 hover:underline font-medium"
          >
            Notes
          </button>
        </div>
      </div>
      {showNotes && (
        <div className="ml-2 pl-3 border-l-2 border-neutral-200">
          <NotesPanel entityType="order" entityId={order.order_id} />
        </div>
      )}
    </li>
  );
}

/** Reusable across the customer-level notes section and every per-order "Notes" toggle --
 * newest-first log (Serial Position + Chunking: multiple staff contribute over time, a single
 * shared textarea would let one person silently overwrite another's context), lazy-loaded only
 * once actually shown rather than prefetched for every row/order up front. */
function NotesPanel({ entityType, entityId }: { entityType: NoteEntityType; entityId: string }) {
  const [notes, setNotes] = useState<InternalNote[] | null>(null);
  const [body, setBody] = useState('');
  const [submitting, startSubmitting] = useTransition();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listNotesAction(entityType, entityId).then((result) => {
      if (!cancelled) setNotes(result);
    });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  function handleAdd() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError('');
    startSubmitting(async () => {
      const result = await createNoteAction(entityType, entityId, trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotes((prev) => [result.note, ...(prev ?? [])]);
      setBody('');
    });
  }

  return (
    <div className="flex flex-col gap-2 max-w-md">
      {notes === null ? (
        <p className="text-xs text-neutral-400">Loading notes...</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-neutral-400">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
          {notes.map((note) => (
            <li key={note.id} className="text-xs bg-white border border-neutral-200 rounded-md p-2">
              <p className="text-neutral-800 whitespace-pre-wrap">{note.body}</p>
              <p className="text-neutral-400 mt-1">
                {note.createdBy} · {new Date(note.createdAt).toLocaleString('en-CA')}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 items-end">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add an internal note..."
          rows={2}
          className="flex-1 text-xs border border-neutral-300 rounded-md p-2 resize-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={submitting || !body.trim()}
          className="text-xs font-medium px-3 py-2 rounded-md bg-neutral-800 text-white disabled:opacity-40 shrink-0"
        >
          {submitting ? 'Adding...' : 'Add Note'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Reps are a reusable list (sales_reps table), not free-text retyped per customer -- so
 * updating a rep's phone number here updates it everywhere they're assigned, instead of
 * needing to edit every customer row individually. */
function SalesRepSection({ customer, salesReps }: { customer: Customer; salesReps: SalesRep[] }) {
  const [pending, startTransition] = useTransition();
  const [showNewRepForm, setShowNewRepForm] = useState(false);
  const [newRep, setNewRep] = useState({ name: '', phone: '', email: '' });
  const [error, setError] = useState('');
  const router = useRouter();

  function handleAssign(salesRepId: string) {
    startTransition(async () => {
      await updateCustomerSalesRepAction(customer.id, salesRepId || null);
      router.refresh();
    });
  }

  function handleCreateRep() {
    if (!newRep.name || !newRep.phone || !newRep.email) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    startTransition(async () => {
      const result = await createSalesRepAction(newRep);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await updateCustomerSalesRepAction(customer.id, result.rep.id);
      setShowNewRepForm(false);
      setNewRep({ name: '', phone: '', email: '' });
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-1.5">Sales Rep</h3>
      {customer.salesRep && (
        <p className="text-sm text-neutral-800 mb-2">
          {customer.salesRep.name} · {customer.salesRep.phone} · {customer.salesRep.email}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={customer.salesRepId ?? ''}
          onChange={(e) => handleAssign(e.target.value)}
          disabled={pending}
          className="text-xs border border-neutral-300 rounded-md px-2 py-1.5"
        >
          <option value="">Unassigned</option>
          {salesReps.map((rep) => (
            <option key={rep.id} value={rep.id}>
              {rep.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowNewRepForm((v) => !v)}
          className="text-xs text-emerald-700 hover:underline"
        >
          + New rep
        </button>
      </div>
      {showNewRepForm && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            placeholder="Name"
            value={newRep.name}
            onChange={(e) => setNewRep((p) => ({ ...p, name: e.target.value }))}
            className="text-xs border border-neutral-300 rounded-md px-2 py-1.5"
          />
          <input
            placeholder="Direct phone"
            value={newRep.phone}
            onChange={(e) => setNewRep((p) => ({ ...p, phone: e.target.value }))}
            className="text-xs border border-neutral-300 rounded-md px-2 py-1.5"
          />
          <input
            placeholder="Email"
            value={newRep.email}
            onChange={(e) => setNewRep((p) => ({ ...p, email: e.target.value }))}
            className="text-xs border border-neutral-300 rounded-md px-2 py-1.5"
          />
          <button
            type="button"
            onClick={handleCreateRep}
            disabled={pending}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-neutral-800 text-white disabled:opacity-40"
          >
            {pending ? 'Saving...' : 'Save & Assign'}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
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
