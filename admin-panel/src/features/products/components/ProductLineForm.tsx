'use client';

import { useMemo, useState, useTransition } from 'react';
import type { TaxonomyEntry } from '@/data/taxonomy';
import type { FilterDefinition } from '@/data/filters';
import { createProductLineAction } from '../actions';

/** Product Line creation form (Flow B2). Reads the same taxonomy + filter-definition data as the
 * Taxonomy page (passed down from the Server Component) so picking Category -> Sub-category ->
 * Brand can locally derive relevant `product`-level filters (§7.2) -- no extra round-trip needed.
 *
 * A 3-step cascading picker (not a single flat Brand <select>) so every Category and Sub-category
 * is always visible, even ones with zero Brands entered so far (most of Smoking/Cannabis
 * Accessories/Convenience, at time of writing) -- those brands exist in the real business, they
 * just haven't been added to this system yet; hiding the branch from a flat list made it look
 * like it didn't exist at all, which is wrong. Brand is still required on every Product Line
 * (every real product has one) -- this only changes how the admin gets there. */
export default function ProductLineForm({
  categories,
  subcategories,
  brands,
  filterDefinitions,
  subcategoryFilterLinks,
}: {
  categories: TaxonomyEntry[];
  subcategories: TaxonomyEntry[];
  brands: TaxonomyEntry[];
  filterDefinitions: FilterDefinition[];
  subcategoryFilterLinks: Record<string, string[]>;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const subsByCategory = useMemo(() => {
    const byCat = new Map<string, TaxonomyEntry[]>();
    for (const sub of subcategories) {
      if (!sub.parentId) continue;
      const list = byCat.get(sub.parentId) ?? [];
      list.push(sub);
      byCat.set(sub.parentId, list);
    }
    return byCat;
  }, [subcategories]);

  const brandsBySubcategory = useMemo(() => {
    const bySub = new Map<string, TaxonomyEntry[]>();
    for (const brand of brands) {
      if (!brand.parentId) continue;
      const list = bySub.get(brand.parentId) ?? [];
      list.push(brand);
      bySub.set(brand.parentId, list);
    }
    return bySub;
  }, [brands]);

  const catSubs = subsByCategory.get(categoryId) ?? [];
  const subBrands = brandsBySubcategory.get(subcategoryId) ?? [];
  const selectedSubcategory = subcategories.find((s) => s.id === subcategoryId);

  const productLevelFilters = useMemo(() => {
    if (!selectedSubcategory) return [];
    const ids = subcategoryFilterLinks[selectedSubcategory.id] ?? [];
    return ids
      .map((id) => filterDefinitions.find((f) => f.id === id))
      .filter((f): f is FilterDefinition => !!f && f.level === 'product');
  }, [selectedSubcategory, subcategoryFilterLinks, filterDefinitions]);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createProductLineAction(formData);
      } catch (err) {
        // next/navigation's redirect() throws internally on success -- only surface real errors.
        if (err instanceof Error && err.message === 'NEXT_REDIRECT') return;
        setError(err instanceof Error ? err.message : 'Failed to create Product Line.');
      }
    });
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
        No Categories exist yet — start on the{' '}
        <a href="/taxonomy" className="text-emerald-700 hover:underline">
          Taxonomy page
        </a>
        .
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      {/* Step 1: Category — every one of the 4 top-level categories, always visible. */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <span className="block text-xs font-medium text-neutral-500 mb-2">1. Category</span>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const count = (subsByCategory.get(cat.id) ?? []).length;
            const active = cat.id === categoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setCategoryId(cat.id);
                  setSubcategoryId('');
                  setBrandId('');
                }}
                className={`rounded-full px-3 py-1.5 text-sm border transition-colors ${
                  active
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'border-neutral-300 text-neutral-700 hover:border-emerald-400'
                }`}
              >
                {cat.name} <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Sub-category — every sub-category under the chosen Category, even 0-brand ones. */}
      {categoryId && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <span className="block text-xs font-medium text-neutral-500 mb-2">2. Sub-category</span>
          {catSubs.length === 0 ? (
            <p className="text-sm text-neutral-400">
              No sub-categories yet under this Category —{' '}
              <a href="/taxonomy" className="text-emerald-700 hover:underline">
                add one on the Taxonomy page
              </a>
              .
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {catSubs.map((sub) => {
                const count = (brandsBySubcategory.get(sub.id) ?? []).length;
                const active = sub.id === subcategoryId;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setSubcategoryId(sub.id);
                      setBrandId('');
                    }}
                    className={`rounded-full px-3 py-1.5 text-sm border transition-colors ${
                      active
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : count === 0
                          ? 'border-neutral-200 text-neutral-400 hover:border-neutral-300'
                          : 'border-neutral-300 text-neutral-700 hover:border-emerald-400'
                    }`}
                  >
                    {sub.name} <span className="opacity-60">({count} brand{count === 1 ? '' : 's'})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Brand — or a way to add one right here if this Sub-category doesn't have any yet. */}
      {subcategoryId && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <span className="block text-xs font-medium text-neutral-500 mb-2">3. Brand</span>
          {subBrands.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No Brands added yet for <span className="font-medium">{selectedSubcategory?.name}</span>.{' '}
              <a href="/taxonomy" className="text-emerald-700 hover:underline">
                Add one on the Taxonomy page
              </a>{' '}
              to continue — every real product needs a Brand.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {subBrands.map((brand) => {
                const active = brand.id === brandId;
                return (
                  <button
                    key={brand.id}
                    type="button"
                    onClick={() => setBrandId(brand.id)}
                    className={`rounded-full px-3 py-1.5 text-sm border transition-colors ${
                      active
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-neutral-300 text-neutral-700 hover:border-emerald-400'
                    }`}
                  >
                    {brand.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 4: the rest of the form — only once a Brand is actually chosen. */}
      {brandId && (
        <form
          action={handleSubmit}
          className="rounded-lg border border-neutral-200 bg-white p-4 space-y-4"
        >
          <input type="hidden" name="brandId" value={brandId} />

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Product Line Name</label>
            <input
              name="title"
              required
              placeholder="e.g. RAW King Size Papers"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          {productLevelFilters.length === 0 && (
            <p className="text-xs text-neutral-400">No extra fields needed for this category yet.</p>
          )}

          {productLevelFilters.map((filter) => (
            <div key={filter.id}>
              <label className="block text-sm font-medium text-neutral-700 mb-1">{filter.label}</label>
              <select
                name={`filter:${filter.key}`}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="">Select...</option>
                {filter.choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Image (optional)</label>
            <input name="image" type="file" accept="image/*" className="w-full text-sm" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? 'Creating...' : 'Create Product Line'}
          </button>
        </form>
      )}
    </div>
  );
}
