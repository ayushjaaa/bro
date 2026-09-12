'use client';

import { useState } from 'react';
import type { Customer } from '@/data/customers';
import type { SalesRep } from '@/data/sales-reps';
import { StatusBadge } from './shared';

/**
 * Groups approved customers by their assigned sales rep -- answers "which accounts does each
 * rep own?" at a glance, instead of scanning the flat table for a name. Only approved
 * customers are eligible for a rep (see the "only after approve" rule enforced in
 * CustomersTable/CustomerDrawer), so pending/rejected rows never appear here. Each rep group is
 * collapsed by default -- clicking a rep's row expands their account list. Unassigned accounts
 * are split into their own tab rather than mixed into the same list as reps -- "which rep owns
 * this" and "who still needs a rep" are two different questions an admin asks separately.
 */
export default function CustomersBySalesRep({
  customers,
  salesReps,
  onSelect,
}: {
  customers: Customer[];
  salesReps: SalesRep[];
  onSelect: (customerId: string) => void;
}) {
  const [tab, setTab] = useState<'reps' | 'unassigned'>('reps');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const approved = customers.filter((c) => c.status === 'approved');
  const byRepId = new Map<string, Customer[]>();
  const unassigned: Customer[] = [];

  for (const c of approved) {
    if (c.salesRepId) {
      const list = byRepId.get(c.salesRepId) ?? [];
      list.push(c);
      byRepId.set(c.salesRepId, list);
    } else {
      unassigned.push(c);
    }
  }

  // Reps with zero accounts still show up (empty state), so it's visible at a glance who has
  // capacity -- not just who already has accounts.
  const repGroups = salesReps.map((rep) => ({ key: rep.id, rep, accounts: byRepId.get(rep.id) ?? [] }));

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex self-start rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
        <button
          type="button"
          onClick={() => setTab('reps')}
          className={`text-xs font-medium px-3 py-1.5 rounded-md ${
            tab === 'reps' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          By Rep
        </button>
        <button
          type="button"
          onClick={() => setTab('unassigned')}
          className={`text-xs font-medium px-3 py-1.5 rounded-md ${
            tab === 'unassigned' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          Unassigned
          {unassigned.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold size-4">
              {unassigned.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'reps' ? (
        repGroups.length === 0 ? (
          <p className="text-sm text-neutral-400">No reps yet.</p>
        ) : (
          repGroups.map(({ key, rep, accounts }) => {
            const expanded = expandedKey === key;
            return (
              <div key={key} className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedKey(expanded ? null : key)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-neutral-50 hover:bg-neutral-100 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 text-neutral-400 transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
                    <span className="text-sm font-semibold text-neutral-800 truncate">{rep.name}</span>
                    <span className="text-xs text-neutral-400 truncate hidden sm:inline">
                      {rep.phone} · {rep.email}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-neutral-500">
                    {accounts.length} account{accounts.length === 1 ? '' : 's'}
                  </span>
                </button>
                {expanded && <AccountList accounts={accounts} onSelect={onSelect} emptyText="No accounts assigned." />}
              </div>
            );
          })
        )
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
          <AccountList accounts={unassigned} onSelect={onSelect} emptyText="No unassigned approved accounts." />
        </div>
      )}
    </div>
  );
}

function AccountList({
  accounts,
  onSelect,
  emptyText,
}: {
  accounts: Customer[];
  onSelect: (customerId: string) => void;
  emptyText: string;
}) {
  if (accounts.length === 0) {
    return <p className="px-4 py-4 text-sm text-neutral-400 border-t border-neutral-100">{emptyText}</p>;
  }
  return (
    <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
      {accounts.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onSelect(c.id)}
            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-neutral-50"
          >
            <div className="min-w-0">
              <p className="text-sm text-neutral-800 truncate">
                {c.firstName} {c.lastName}
              </p>
              <p className="text-xs text-neutral-400 truncate">{c.businessName ?? c.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-xs text-neutral-400">{c.accountNumber ?? '—'}</span>
              <StatusBadge status={c.status} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
