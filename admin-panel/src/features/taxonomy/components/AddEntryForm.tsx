'use client';

import { useState, type FormEvent } from 'react';

/**
 * Inline create-form, per ADMIN_PANEL_IMPLEMENTATION.md §3a's Taxonomy wireframe — opens in
 * place (not a separate page/modal), parent id is pre-filled via a hidden field from context.
 */
export default function AddEntryForm({
  label,
  imageFieldName,
  parentField,
  onSubmit,
  onDone,
}: {
  label: string;
  imageFieldName: 'image' | 'logo';
  parentField?: { name: string; value: string };
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
      setError(err instanceof Error ? err.message : 'Failed to create.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 my-1"
    >
      {parentField && <input type="hidden" name={parentField.name} value={parentField.value} />}
      <input
        name="name"
        required
        autoFocus
        placeholder={`${label} name`}
        className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500"
      />
      <input
        name="description"
        placeholder="Description (optional)"
        className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500"
      />
      <input name={imageFieldName} type="file" accept="image/*" className="text-xs" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-emerald-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : `Add ${label}`}
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
