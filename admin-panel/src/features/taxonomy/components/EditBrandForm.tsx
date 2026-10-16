'use client';

import { useState, type FormEvent } from 'react';
import type { TaxonomyEntry } from '@/data/taxonomy';

/** Inline edit-form for an existing Brand -- opens in place of the row, same pattern as
 * AddEntryForm. Lets staff fix the name/description or add/replace the logo after creation,
 * which the original Brand flow had no way to do once the metaobject existed. */
export default function EditBrandForm({
  brand,
  onSubmit,
  onDone,
}: {
  brand: TaxonomyEntry;
  onSubmit: (formData: FormData) => Promise<unknown>;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit(new FormData(e.currentTarget));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-md border border-sky-200 bg-sky-50/50 p-3 my-1"
    >
      <input type="hidden" name="id" value={brand.id} />
      <input
        name="name"
        required
        autoFocus
        defaultValue={brand.name}
        placeholder="Brand name"
        className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-sky-500"
      />
      <input
        name="description"
        defaultValue={brand.description ?? ''}
        placeholder="Description (optional)"
        className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-sky-500"
      />
      <div className="flex items-center gap-2">
        {brand.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.imageUrl} alt="" className="h-8 w-8 rounded object-cover border border-neutral-200" />
        )}
        <input name="logo" type="file" accept="image/*" className="text-xs" />
      </div>
      <p className="text-[11px] text-neutral-400">Leave the logo field empty to keep the current logo.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-sky-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-neutral-500 hover:text-neutral-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
