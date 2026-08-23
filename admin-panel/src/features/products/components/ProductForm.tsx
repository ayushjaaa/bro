'use client';

import { useState, useMemo } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import type { TaxonomyEntry } from '@/data/taxonomy';

/**
 * Per ADMIN_PANEL_IMPLEMENTATION.md §3a's wireframe — 3 cascading, read-only selectors
 * (Category/Sub-category/Brand are a pre-existing chain, fact 3, never free-text/onCreate here)
 * + Product Name/Description/Image, which is everything productCreate needs. No Flavor/Region
 * fields on this form (fact 1 — those belong to the separate bulk-upload step).
 */
export default function ProductForm({
  categories,
  allSubcategories,
  allBrands,
}: {
  categories: TaxonomyEntry[];
  allSubcategories: TaxonomyEntry[];
  allBrands: TaxonomyEntry[];
}) {
  const [categoryId, setCategoryId] = useState<string>();
  const [subcategoryId, setSubcategoryId] = useState<string>();
  const [brandId, setBrandId] = useState<string>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subcategoryOptions = useMemo(
    () => allSubcategories.filter((s) => s.parentId === categoryId),
    [allSubcategories, categoryId]
  );
  const brandOptions = useMemo(
    () => allBrands.filter((b) => b.parentId === subcategoryId),
    [allBrands, subcategoryId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!brandId || !name.trim()) {
      setError('Brand and Product Name are required.');
      return;
    }

    setSubmitting(true);
    // TODO: wire to createProductLineAction once data/product-lines.ts exists — placeholder
    // submit for now so the form itself is testable independently.
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SearchableSelect
          label="Category"
          placeholder="Select category"
          value={categoryId}
          options={categories.map((c) => ({ id: c.id, label: c.name }))}
          onChange={(id) => {
            setCategoryId(id);
            setSubcategoryId(undefined);
            setBrandId(undefined);
          }}
        />
        <SearchableSelect
          label="Sub-category"
          placeholder="Select sub-category"
          disabled={!categoryId}
          disabledHint="Select a category first"
          value={subcategoryId}
          options={subcategoryOptions.map((s) => ({ id: s.id, label: s.name }))}
          onChange={(id) => {
            setSubcategoryId(id);
            setBrandId(undefined);
          }}
        />
        <SearchableSelect
          label="Brand"
          placeholder="Select brand"
          disabled={!subcategoryId}
          disabledHint="Select a sub-category first"
          value={brandId}
          options={brandOptions.map((b) => ({ id: b.id, label: b.name }))}
          onChange={setBrandId}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-neutral-700">Product Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Beast Mode Max 2"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-neutral-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-neutral-700">Base Image</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImage(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Product Line →'}
        </button>
      </div>
    </form>
  );
}
