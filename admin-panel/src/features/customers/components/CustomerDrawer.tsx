'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Customer, OrderStatusRow } from '@/data/customers';
import type { SalesRep } from '@/data/sales-reps';
import type { InternalNote, NoteEntityType } from '@/data/internal-notes';
import {
  getRegistrationDocumentUrlAction,
  updateAccountTypeAction,
  updateCustomerSalesRepAction,
  createSalesRepAction,
  listNotesAction,
  createNoteAction,
} from '../actions';
import { InfoCard } from './InfoCard';
import { RepForm, type RepFormValue } from '@/features/sales-reps/components/RepForm';
import { Field, StatusBadge } from './shared';
import { PhoneIcon, MailIcon, UserIcon, NoteIcon, XIcon } from '@/components/icons';

/**
 * Slide-over drawer replacing the old inline `<tr>` expand -- every section of customer detail
 * (Contact, Business Info, Addresses, Documents, Compliance, Sales Rep, Internal Notes, Orders)
 * is now its own bounded `InfoCard` instead of one continuous unlabeled column, per the
 * approved Customers-page redesign plan. Same interaction convention as the existing
 * `CustomerActivityModal` (CartOverview.tsx) -- backdrop click / Escape to close -- but
 * edge-anchored instead of centered.
 */
export default function CustomerDrawer({
  customer,
  orders,
  salesReps,
  onClose,
}: {
  customer: Customer;
  orders: OrderStatusRow[];
  salesReps: SalesRep[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [accountTypeError, setAccountTypeError] = useState('');
  const [loadingDocumentPath, setLoadingDocumentPath] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState('');

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // C6: previously no try/catch and no loading state -- getRegistrationDocumentUrl throws if
  // Supabase Storage's createSignedUrl fails, so clicking the link did nothing visible at all,
  // with no way to tell if it was working or broken.
  async function handleViewDocument(path: string) {
    setDocumentError('');
    setLoadingDocumentPath(path);
    try {
      const url = await getRegistrationDocumentUrlAction(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[CustomerDrawer] handleViewDocument failed:', err);
      setDocumentError('Could not open this document. Please try again.');
    } finally {
      setLoadingDocumentPath(null);
    }
  }

  // C5: previously no try/catch -- a thrown error inside an async startTransition callback is not
  // a render-phase error, so no Error Boundary catches it; it's just a silent unhandled rejection.
  // `pending` still resolves but `router.refresh()` never runs, so the row silently keeps its old
  // state with zero error shown to the admin.
  function handleAccountTypeChange(accountType: 'retail' | 'wholesale') {
    setAccountTypeError('');
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('id', customer.id);
        formData.set('accountType', accountType);
        await updateAccountTypeAction(formData);
        router.refresh();
      } catch (err) {
        console.error('[CustomerDrawer] handleAccountTypeChange failed:', err);
        setAccountTypeError('Could not update account type. Please try again.');
      }
    });
  }

  const latestByOrder = new Map<string, OrderStatusRow>();
  for (const row of [...orders].sort((a, b) => b.changed_at.localeCompare(a.changed_at))) {
    if (!latestByOrder.has(row.order_id)) latestByOrder.set(row.order_id, row);
  }
  const hasOrdered = [...latestByOrder.keys()].some((id) => id.includes('/Order/'));

  const has005Fields =
    customer.businessRegistrationNumber || customer.pstNumber || customer.vptNumber || customer.typeOfBusiness || customer.licenseNumber;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-neutral-50 shadow-xl overflow-y-auto flex flex-col">
        <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-neutral-900">
                {customer.firstName} {customer.lastName}
              </h2>
              <StatusBadge status={customer.status} />
            </div>
            <p className="text-sm text-neutral-500">{customer.businessName ?? customer.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close"
          >
            <XIcon className="size-4.5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {customer.status === 'approved' && (
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3">
              <span className="text-xs font-medium text-neutral-500">Account type</span>
              {(['retail', 'wholesale'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleAccountTypeChange(type)}
                  disabled={pending}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${
                    customer.accountType === type
                      ? 'bg-brand-purple-deep text-white border-brand-purple-deep'
                      : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  {type}
                </button>
              ))}
              {customer.accountNumber && (
                <span className="ml-auto font-mono text-xs text-neutral-500">{customer.accountNumber}</span>
              )}
            </div>
          )}
          {accountTypeError && <p className="text-xs text-red-600">{accountTypeError}</p>}

          <InfoCard title="Contact">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <Field label="Email" value={customer.email} />
              <Field label="Business Phone" value={customer.phone} />
              <Field label="Personal Cell" value={customer.personalCell} />
              {customer.status === 'approved' && (
                <Field
                  label="Approved"
                  value={`${customer.approvedBy ?? '—'} on ${customer.approvedAt ? new Date(customer.approvedAt).toLocaleDateString('en-CA') : '—'}`}
                />
              )}
            </div>
          </InfoCard>

          {has005Fields && (
            <InfoCard title="Legacy Fields">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <Field label="Business Registration #" value={customer.businessRegistrationNumber} />
                <Field label="PST Number" value={customer.pstNumber} />
                <Field label="VPT Number" value={customer.vptNumber} />
                <Field label="Type of Business" value={customer.typeOfBusiness} />
                <Field label="License Number" value={customer.licenseNumber} />
              </div>
            </InfoCard>
          )}

          <InfoCard title="Business Info">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
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
          </InfoCard>

          <InfoCard title="Addresses">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase text-neutral-400 mb-1">Shipping</p>
                <p className="text-sm text-neutral-800">
                  {[customer.shipLine1, customer.shipLine2, customer.shipCity, customer.shipProvince, customer.shipPostalCode]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase text-neutral-400 mb-1">Billing</p>
                <p className="text-sm text-neutral-800">
                  {customer.billSameAsShipping
                    ? 'Same as shipping'
                    : [customer.billLine1, customer.billLine2, customer.billCity, customer.billProvince, customer.billPostalCode]
                        .filter(Boolean)
                        .join(', ') || '—'}
                </p>
              </div>
            </div>
          </InfoCard>

          <InfoCard title="Documents">
            <div className="flex flex-wrap gap-2">
              {customer.businessLicencePath ? (
                <button
                  type="button"
                  onClick={() => handleViewDocument(customer.businessLicencePath!)}
                  disabled={loadingDocumentPath === customer.businessLicencePath}
                  className="text-sm font-medium text-brand-purple-deep hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {loadingDocumentPath === customer.businessLicencePath ? 'Opening…' : 'View Business/Tax Licence'}
                </button>
              ) : (
                <span className="text-sm text-neutral-400">No business licence uploaded</span>
              )}
              {customer.specialtyLicencePath && (
                <button
                  type="button"
                  onClick={() => handleViewDocument(customer.specialtyLicencePath!)}
                  disabled={loadingDocumentPath === customer.specialtyLicencePath}
                  className="text-sm font-medium text-brand-purple-deep hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {loadingDocumentPath === customer.specialtyLicencePath ? 'Opening…' : 'View Specialty Store Licence'}
                </button>
              )}
            </div>
            {documentError && <p className="text-xs text-red-600 mt-2">{documentError}</p>}
          </InfoCard>

          <InfoCard title="Compliance">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <Field label="Tax Exempt" value={customer.taxExempt == null ? null : customer.taxExempt ? 'Yes' : 'No'} />
              <Field label="How They Heard About Us" value={customer.referralSource} />
              <Field
                label="Signed By"
                value={
                  customer.signatureName
                    ? `${customer.signatureName}${customer.signedAt ? ` on ${new Date(customer.signedAt).toLocaleString('en-CA')}` : ''}`
                    : null
                }
              />
            </div>
          </InfoCard>

          {/* Assigning a rep only makes sense once someone is a real approved account. */}
          {customer.status === 'approved' && <SalesRepCard customer={customer} salesReps={salesReps} />}

          <InfoCard
            title="Internal Notes"
            action={<NoteIcon className="size-4 text-neutral-400" />}
          >
            <NotesPanel entityType="customer" entityId={customer.id} />
          </InfoCard>

          {customer.shopifyCustomerId && (
            <InfoCard title={`Orders ${hasOrdered ? '· has ordered' : '· never ordered'}`}>
              {latestByOrder.size === 0 ? (
                <p className="text-sm text-neutral-400">No order requests yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {[...latestByOrder.values()].map((o) => (
                    <OrderLine key={o.order_id} order={o} />
                  ))}
                </ul>
              )}
              <p className="text-xs text-neutral-400 mt-3">
                Cart contents live on the{' '}
                <a href="/cart" className="text-brand-purple-deep hover:underline">
                  Cart
                </a>{' '}
                page.
              </p>
            </InfoCard>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderLine({ order }: { order: OrderStatusRow }) {
  const [showNotes, setShowNotes] = useState(false);
  return (
    <li className="rounded-lg border border-neutral-100 bg-neutral-50/60 p-2.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-neutral-700">
          {order.order_id.includes('/DraftOrder/') ? 'Draft' : 'Order'} {order.order_id.split('/').pop()}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">
            {order.new_status} · {new Date(order.changed_at).toLocaleString('en-CA')}
          </span>
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="text-xs font-semibold text-brand-purple-deep hover:underline"
          >
            {showNotes ? 'Hide notes' : 'Notes'}
          </button>
        </div>
      </div>
      {showNotes && (
        <div className="mt-2 pt-2 border-t border-neutral-200">
          <NotesPanel entityType="order" entityId={order.order_id} compact />
        </div>
      )}
    </li>
  );
}

/** Reusable across the customer-level notes card and every per-order "Notes" toggle -- clear,
 * distinct call-to-action (solid button, real form-control sizing) instead of `text-xs`
 * controls blending into the surrounding fields, per the redesign's specific ask. */
function NotesPanel({
  entityType,
  entityId,
  compact = false,
}: {
  entityType: NoteEntityType;
  entityId: string;
  compact?: boolean;
}) {
  const [notes, setNotes] = useState<InternalNote[] | null>(null);
  const [notesError, setNotesError] = useState(false);
  const [body, setBody] = useState('');
  const [submitting, startSubmitting] = useTransition();
  const [error, setError] = useState('');

  function loadNotes() {
    let cancelled = false;
    setNotesError(false);
    listNotesAction(entityType, entityId)
      .then((result) => {
        if (!cancelled) setNotes(result);
      })
      .catch((err) => {
        // C7: previously no `.catch` -- a thrown error left `notes` stuck at `null` forever
        // (permanent "Loading notes…"), with no retry, and an unhandled promise rejection.
        console.error('[CustomerDrawer] listNotesAction failed:', err);
        if (!cancelled) {
          setNotes([]);
          setNotesError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }

  useEffect(() => {
    return loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="flex flex-col gap-2.5">
      {notes === null ? (
        <p className="text-sm text-neutral-400">Loading notes…</p>
      ) : notesError ? (
        <p className="text-sm text-red-600">
          Could not load notes.{' '}
          <button type="button" onClick={loadNotes} className="font-semibold underline">
            Retry
          </button>
        </p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-neutral-400">No notes yet.</p>
      ) : (
        <ul className={`flex flex-col gap-2 overflow-y-auto ${compact ? 'max-h-32' : 'max-h-56'}`}>
          {notes.map((note) => (
            <li key={note.id} className="text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
              <p className="text-neutral-800 whitespace-pre-wrap">{note.body}</p>
              <p className="text-xs text-neutral-400 mt-1">
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
          placeholder="Add an internal note…"
          rows={2}
          className="flex-1 text-sm border border-neutral-300 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-purple-accent/30 focus:border-brand-purple-deep"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={submitting || !body.trim()}
          className="text-sm font-semibold px-3.5 py-2 rounded-lg bg-brand-purple-deep text-white hover:bg-brand-purple-deep/90 disabled:opacity-40 disabled:hover:bg-brand-purple-deep shrink-0"
        >
          {submitting ? 'Adding…' : 'Add Note'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Reps are a reusable list (`sales_reps` table), not free-text retyped per customer -- so
 * updating a rep's phone number here updates it everywhere they're assigned. Redesigned per
 * the specific ask: assigned state reads like a real contact card (tel:/mailto: links), the
 * reassign control is a normal-weight labeled select, and "add a new rep" is a real button,
 * not a bare text link. */
function SalesRepCard({ customer, salesReps }: { customer: Customer; salesReps: SalesRep[] }) {
  const [pending, startTransition] = useTransition();
  const [showNewRepForm, setShowNewRepForm] = useState(false);
  const [newRep, setNewRep] = useState<RepFormValue>({ name: '', phone: '', email: '' });
  const [error, setError] = useState('');
  const router = useRouter();

  // C5: previously no try/catch -- same silent-unhandled-rejection-inside-startTransition gap as
  // handleAccountTypeChange above.
  function handleAssign(salesRepId: string) {
    setError('');
    startTransition(async () => {
      try {
        await updateCustomerSalesRepAction(customer.id, salesRepId || null);
        router.refresh();
      } catch (err) {
        console.error('[CustomerDrawer] handleAssign failed:', err);
        setError('Could not assign the rep. Please try again.');
      }
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
      // C4: the rep row now exists in Shopify/Supabase (create succeeded) -- if THIS second call
      // throws, previously the form stayed open with no error shown, and the admin (seeing
      // nothing happen) would likely click "Save & Assign" again and create a duplicate rep.
      try {
        await updateCustomerSalesRepAction(customer.id, result.rep.id);
        setShowNewRepForm(false);
        setNewRep({ name: '', phone: '', email: '' });
        router.refresh();
      } catch (err) {
        console.error('[CustomerDrawer] handleCreateRep assign step failed:', err);
        setError(`"${result.rep.name}" was created but could not be assigned — please assign manually from the dropdown above.`);
        // The rep row itself was created successfully -- refresh so it shows up in the "Assigned
        // rep" dropdown for manual assignment, matching the error message above.
        router.refresh();
      }
    });
  }

  return (
    <InfoCard title="Sales Rep">
      <div className="flex flex-col gap-3">
        {customer.salesRep ? (
          <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-purple-deep/10 text-brand-purple-deep">
              <UserIcon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900 truncate">{customer.salesRep.name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                <a
                  href={`tel:${customer.salesRep.phone}`}
                  className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-brand-purple-deep"
                >
                  <PhoneIcon className="size-3" />
                  {customer.salesRep.phone}
                </a>
                <a
                  href={`mailto:${customer.salesRep.email}`}
                  className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-brand-purple-deep"
                >
                  <MailIcon className="size-3" />
                  {customer.salesRep.email}
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-500">
            No rep assigned yet.
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Assigned rep</label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={customer.salesRepId ?? ''}
              onChange={(e) => handleAssign(e.target.value)}
              disabled={pending}
              className="text-sm border border-neutral-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple-accent/30 focus:border-brand-purple-deep"
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
              className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            >
              + New rep
            </button>
          </div>
        </div>

        {showNewRepForm && (
          <div className="rounded-lg border border-brand-purple-accent/40 bg-brand-purple-deep/5 p-3 flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-purple-deep">New rep</p>
            <RepForm value={newRep} onChange={setNewRep} disabled={pending} />
            <button
              type="button"
              onClick={handleCreateRep}
              disabled={pending}
              className="self-start text-sm font-semibold px-3.5 py-1.5 rounded-lg bg-brand-purple-deep text-white hover:bg-brand-purple-deep/90 disabled:opacity-40"
            >
              {pending ? 'Saving…' : 'Save & Assign'}
            </button>
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </InfoCard>
  );
}
