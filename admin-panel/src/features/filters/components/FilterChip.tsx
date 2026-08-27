'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FilterDefinition } from '@/data/filters';
import { addChoiceToFilterAction } from '../actions';

/** A filter's label as a clickable chip; click expands to show its current Choices and an
 * "Add value" input. Deliberately no delete/remove control anywhere here (§7.4 rule 6) -- an
 * in-use choice must never become invalid on existing products, so values only ever get added. */
export default function FilterChip({ filter }: { filter: FilterDefinition }) {
  const [open, setOpen] = useState(false);
  const [newChoice, setNewChoice] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('filterDefinitionId', filter.id);
      formData.set('newChoice', newChoice);
      try {
        await addChoiceToFilterAction(formData);
        setNewChoice('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add value.');
      }
    });
  }

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 hover:bg-sky-100"
        title={`key: ${filter.key} · level: ${filter.level}`}
      >
        {filter.label}
      </button>

      {open && (
        <div className="mt-1 rounded-md border border-sky-200 bg-white p-2 text-xs w-56 shadow-sm">
          {filter.level === 'native' ? (
            <p className="text-neutral-400">Native filter — no choices to edit.</p>
          ) : (
            <>
              <p className="text-neutral-500 mb-1">Current values:</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {filter.choices.map((c) => (
                  <span key={c} className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-700">
                    {c}
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  value={newChoice}
                  onChange={(e) => setNewChoice(e.target.value)}
                  placeholder="Add value..."
                  className="flex-1 rounded border border-neutral-300 px-1.5 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={pending || !newChoice.trim()}
                  className="rounded bg-emerald-600 text-white px-2 py-1 text-xs hover:bg-emerald-700 disabled:opacity-50"
                >
                  {pending ? '...' : 'Add'}
                </button>
              </div>
              {error && <p className="text-red-600 mt-1">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
