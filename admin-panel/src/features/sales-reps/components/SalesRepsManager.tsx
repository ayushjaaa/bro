'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Customer, OrderStatusRow } from '@/data/customers';
import type { SalesRep } from '@/data/sales-reps';
import { createSalesRepAction } from '@/features/customers/actions';
import { updateSalesRepAction } from '../actions';
import CustomersBySalesRep from '@/features/customers/components/CustomersBySalesRep';
import CustomerDrawer from '@/features/customers/components/CustomerDrawer';
import { useLiveTable } from '@/features/dashboard/hooks/useLiveTable';
import { RepForm, type RepFormValue } from './RepForm';
import { PhoneIcon, MailIcon, XIcon } from '@/components/icons';

/**
 * Standalone Sales Reps page: an editable rep directory (create + edit, reps were previously
 * only creatable from a buried form inside the Customers drawer) plus the same
 * `CustomersBySalesRep` grouping + `CustomerDrawer` already built for /customers, reused as-is
 * for full parity -- clicking a customer here opens the exact same detail view.
 */
export default function SalesRepsManager({
  salesReps,
  customers,
  initialOrderStatusLog,
}: {
  salesReps: SalesRep[];
  customers: Customer[];
  initialOrderStatusLog: OrderStatusRow[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const orderStatusLog = useLiveTable('order_status_log', 'id', initialOrderStatusLog);

  const selectedCustomer = customers.find((c) => c.id === selectedId) ?? null;
  const selectedOrders = selectedCustomer?.shopifyCustomerId
    ? [...orderStatusLog.values()].filter((row) => row.customer_id === selectedCustomer.shopifyCustomerId)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <RepDirectory salesReps={salesReps} />

      <div>
        <h2 className="text-sm font-semibold text-neutral-700 mb-2">Accounts by rep</h2>
        <CustomersBySalesRep customers={customers} salesReps={salesReps} onSelect={setSelectedId} />
      </div>

      {selectedCustomer && (
        <CustomerDrawer
          customer={selectedCustomer}
          orders={selectedOrders}
          salesReps={salesReps}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function RepDirectory({ salesReps }: { salesReps: SalesRep[] }) {
  const [showNewForm, setShowNewForm] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-neutral-700">Rep directory</h2>
        <button
          type="button"
          onClick={() => setShowNewForm((v) => !v)}
          className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
        >
          + Add rep
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {salesReps.map((rep) => (
          <RepCard key={rep.id} rep={rep} />
        ))}
      </div>

      {salesReps.length === 0 && (
        <p className="text-sm text-neutral-400 mt-2">No reps yet -- add one to start assigning accounts.</p>
      )}

      {showNewForm && <NewRepModal onClose={() => setShowNewForm(false)} />}
    </div>
  );
}

function RepCard({ rep }: { rep: SalesRep }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<RepFormValue>({ name: rep.name, phone: rep.phone, email: rep.email });
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    if (!form.name || !form.phone || !form.email) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    startTransition(async () => {
      const result = await updateSalesRepAction(rep.id, form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-brand-purple-accent/40 bg-brand-purple-deep/5 p-4 flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-purple-deep">Edit rep</p>
        <RepForm value={form} onChange={setForm} disabled={pending} />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="text-sm font-semibold px-3.5 py-1.5 rounded-lg bg-brand-purple-deep text-white hover:bg-brand-purple-deep/90 disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={() => {
              setForm({ name: rep.name, phone: rep.phone, email: rep.email });
              setError('');
              setEditing(false);
            }}
            className="text-sm font-medium px-3.5 py-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-900">{rep.name}</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-semibold text-neutral-500 hover:text-brand-purple-deep border border-neutral-200 rounded-full px-2 py-0.5 hover:border-brand-purple-accent"
        >
          Edit
        </button>
      </div>
      <a href={`tel:${rep.phone}`} className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-brand-purple-deep">
        <PhoneIcon className="size-3.5 text-neutral-400" />
        {rep.phone}
      </a>
      <a href={`mailto:${rep.email}`} className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-brand-purple-deep">
        <MailIcon className="size-3.5 text-neutral-400" />
        {rep.email}
      </a>
    </div>
  );
}

/** Centered modal instead of an inline card in the directory grid -- adding a rep is a
 * deliberate, focused task (three required fields), so it gets its own moment instead of
 * competing for attention next to the existing rep cards. Escape/backdrop-click to close, same
 * convention as `CustomerDrawer`. */
function NewRepModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<RepFormValue>({ name: '', phone: '', email: '' });
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleCreate() {
    if (!form.name || !form.phone || !form.email) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    startTransition(async () => {
      const result = await createSalesRepAction(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl bg-white shadow-xl p-5 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Add a sales rep</h3>
            <p className="text-xs text-neutral-500 mt-0.5">They&apos;ll be assignable to any approved account.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <RepForm value={form} onChange={setForm} disabled={pending} />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleCreate}
            disabled={pending}
            className="text-sm font-semibold px-3.5 py-1.5 rounded-lg bg-brand-purple-deep text-white hover:bg-brand-purple-deep/90 disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save rep'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium px-3.5 py-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
