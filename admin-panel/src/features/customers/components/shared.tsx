import type { Customer } from '@/data/customers';

export function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-neutral-400 text-xs">{label}</dt>
      <dd className="text-neutral-800">{value || '—'}</dd>
    </div>
  );
}

export function StatusBadge({ status }: { status: Customer['status'] }) {
  const styles = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-neutral-100 text-neutral-500 border-neutral-200',
  }[status];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${styles}`}>{status}</span>;
}
