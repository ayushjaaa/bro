'use client';

import { useMemo, useState, useTransition } from 'react';
import { createFilterAction } from '../actions';
import type { FilterDefinition, FilterLevel } from '@/data/filters';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[/]/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Inline create-form for a FilterDefinition, attached to one Sub-category on submit (§7.2/§7.4-2:
 * `level` is a required, explicit choice here — never blanket-assumed).
 *
 * Key is auto-suggested as `<subcategory-slug>_<label-slug>` (still editable) so a new filter
 * doesn't default to a bare generic key like "material" -- the whole point of domain-prefixed
 * keys (§7.3) is defeated if the admin has to remember to type the prefix themselves. The slug is
 * derived from the Sub-category's actual name at creation time (not a hardcoded lookup), so this
 * works for any future Sub-category the admin adds too, not just the ones seeded so far.
 *
 * Checks client-side, live as the admin types (before submit): (a) a key that already exists
 * anywhere in the catalog, and (b) a duplicate label already attached to this same Sub-category --
 * both would otherwise only surface as a raw Shopify API error after submit. */
export default function AddFilterForm({
  subcategoryName,
  existingFiltersForThisSubcategory,
  allFilterKeys,
  subcategoryId,
  onDone,
}: {
  subcategoryName: string;
  existingFiltersForThisSubcategory: FilterDefinition[];
  allFilterKeys: string[];
  subcategoryId: string;
  onDone: () => void;
}) {
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [level, setLevel] = useState<FilterLevel>('product');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const domainSlug = useMemo(() => slugify(subcategoryName), [subcategoryName]);

  function handleLabelChange(value: string) {
    setLabel(value);
    if (!keyTouched) {
      setKey(value ? `${domainSlug}_${slugify(value)}` : '');
    }
  }

  const keyCollision = key.length > 0 && allFilterKeys.includes(key);
  const duplicateLabel =
    label.trim().length > 0 &&
    existingFiltersForThisSubcategory.some(
      (f) => f.label.trim().toLowerCase() === label.trim().toLowerCase()
    );
  const blocked = keyCollision || duplicateLabel;

  function handleSubmit(formData: FormData) {
    setError(null);
    if (blocked) return;
    formData.set('subcategoryId', subcategoryId);
    startTransition(async () => {
      try {
        await createFilterAction(formData);
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create filter.');
      }
    });
  }

  return (
    <form action={handleSubmit} className="my-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 space-y-2">
      <div className="flex gap-2">
        <input
          name="label"
          value={label}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="Label (e.g. Material)"
          required
          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <input
          name="key"
          value={key}
          onChange={(e) => {
            setKeyTouched(true);
            setKey(e.target.value);
          }}
          placeholder="Key (auto-suggested)"
          required
          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm font-mono"
        />
      </div>
      {duplicateLabel && (
        <p className="text-xs text-amber-600">
          &quot;{label}&quot; is already a filter on this Sub-category — pick a different label.
        </p>
      )}
      {keyCollision && !duplicateLabel && (
        <p className="text-xs text-amber-600">
          Ye key already use ho rahi hai — alag naam try karo.
        </p>
      )}

      <select
        name="level"
        value={level}
        onChange={(e) => setLevel(e.target.value as FilterLevel)}
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
      >
        <option value="product">Product-Level (default — same across every flavour)</option>
        <option value="variant">Variant-Level (differs per flavour, part of flavour identity)</option>
        <option value="native">Native (Price / Availability / Brand / Flavor — no metafield)</option>
      </select>

      {level === 'native' ? (
        <select name="nativeField" required className="w-full rounded border border-neutral-300 px-2 py-1 text-sm">
          <option value="price">Price</option>
          <option value="availability">Availability</option>
          <option value="brand">Brand</option>
          <option value="flavor">Flavor</option>
        </select>
      ) : (
        <input
          name="choices"
          placeholder="Choices, comma-separated (e.g. Hemp, Rice, Unbleached)"
          required
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || blocked}
          className="rounded-md bg-emerald-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? 'Saving...' : 'Add Filter'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-neutral-300 text-xs font-medium px-3 py-1.5 hover:bg-neutral-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
