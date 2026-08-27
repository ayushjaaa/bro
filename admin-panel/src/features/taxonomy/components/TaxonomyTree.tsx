'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TaxonomyEntry } from '@/data/taxonomy';
import type { FilterDefinition } from '@/data/filters';
import { createCategoryAction, createSubcategoryAction, createBrandAction } from '../actions';
import AddEntryForm from './AddEntryForm';
import AddFilterForm from '@/features/filters/components/AddFilterForm';
import FilterChip from '@/features/filters/components/FilterChip';

type OpenForm =
  | 'category'
  | { level: 'sub'; categoryId: string }
  | { level: 'brand'; subcategoryId: string }
  | { level: 'filter'; subcategoryId: string }
  | null;

export default function TaxonomyTree({
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
  const router = useRouter();
  // No local copy of server data (categories/subcategories/brands come straight from props) —
  // after a create, router.refresh() re-runs the Server Component parent and passes fresh props
  // here, rather than this component trying to merge in an optimistic update itself.
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [openForm, setOpenForm] = useState<OpenForm>(null);

  function toggle(set: Set<string>, setFn: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setFn(next);
  }

  /** Closes the inline form and re-fetches (AddEntryForm calls this after a successful create,
   * or immediately on Cancel — refreshing on Cancel too is harmless). */
  function closeForm() {
    setOpenForm(null);
    router.refresh();
  }

  if (categories.length === 0 && openForm !== 'category') {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-neutral-500">No categories yet — this panel starts here.</p>
        <button
          onClick={() => setOpenForm('category')}
          className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700"
        >
          + Add your first Category
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <span className="text-sm font-semibold text-neutral-700">Categories</span>
        <button
          onClick={() => setOpenForm('category')}
          className="text-xs font-medium text-emerald-700 hover:underline"
        >
          + Add Category
        </button>
      </div>

      {openForm === 'category' && (
        <div className="px-4 pt-3">
          <AddEntryForm
            label="Category"
            imageFieldName="image"
            onSubmit={createCategoryAction}
            onDone={closeForm}
          />
        </div>
      )}

      <ul className="text-sm px-2 pb-2">
        {categories.map((cat) => {
          const isOpen = expandedCats.has(cat.id);
          const catSubs = subcategories.filter((s) => s.parentId === cat.id);
          return (
            <li key={cat.id} className="py-0.5">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-50">
                <button
                  onClick={() => toggle(expandedCats, setExpandedCats, cat.id)}
                  className="flex-1 flex items-center gap-1.5 text-left text-neutral-800 font-medium"
                >
                  <span className="text-neutral-400 w-3">{isOpen ? '▾' : '▸'}</span>
                  {cat.name}
                </button>
                <button
                  onClick={() => setOpenForm({ level: 'sub', categoryId: cat.id })}
                  className="text-xs text-emerald-700 hover:underline shrink-0"
                >
                  + Add Sub-category
                </button>
              </div>

              {isOpen && (
                <div className="ml-5 border-l border-neutral-200 pl-3">
                  {typeof openForm === 'object' &&
                    openForm?.level === 'sub' &&
                    openForm.categoryId === cat.id && (
                      <AddEntryForm
                        label="Sub-category"
                        imageFieldName="image"
                        parentField={{ name: 'categoryId', value: cat.id }}
                        onSubmit={createSubcategoryAction}
                        onDone={closeForm}
                      />
                    )}
                  {catSubs.map((sub) => {
                    const subOpen = expandedSubs.has(sub.id);
                    const subBrands = brands.filter((b) => b.parentId === sub.id);
                    return (
                      <div key={sub.id} className="py-0.5">
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-50">
                          <button
                            onClick={() => toggle(expandedSubs, setExpandedSubs, sub.id)}
                            className="flex-1 flex items-center gap-1.5 text-left text-neutral-700"
                          >
                            <span className="text-neutral-400 w-3">{subOpen ? '▾' : '▸'}</span>
                            {sub.name}
                          </button>
                          <button
                            onClick={() => setOpenForm({ level: 'brand', subcategoryId: sub.id })}
                            className="text-xs text-emerald-700 hover:underline shrink-0"
                          >
                            + Add Brand
                          </button>
                          <button
                            onClick={() => setOpenForm({ level: 'filter', subcategoryId: sub.id })}
                            className="text-xs text-sky-700 hover:underline shrink-0"
                          >
                            + Manage Filters
                          </button>
                        </div>

                        {subOpen && (
                          <div className="ml-5 border-l border-neutral-200 pl-3">
                            {typeof openForm === 'object' &&
                              openForm?.level === 'brand' &&
                              openForm.subcategoryId === sub.id && (
                                <AddEntryForm
                                  label="Brand"
                                  imageFieldName="logo"
                                  parentField={{ name: 'subcategoryId', value: sub.id }}
                                  onSubmit={createBrandAction}
                                  onDone={closeForm}
                                />
                              )}
                            {typeof openForm === 'object' &&
                              openForm?.level === 'filter' &&
                              openForm.subcategoryId === sub.id && (
                                <AddFilterForm
                                  subcategoryId={sub.id}
                                  subcategoryName={sub.name}
                                  existingFiltersForThisSubcategory={(subcategoryFilterLinks[sub.id] ?? [])
                                    .map((id) => filterDefinitions.find((f) => f.id === id))
                                    .filter((f): f is FilterDefinition => !!f)}
                                  allFilterKeys={filterDefinitions.map((f) => f.key)}
                                  onDone={closeForm}
                                />
                              )}
                            {subBrands.map((brand) => (
                              <div key={brand.id} className="px-2 py-1.5 text-neutral-600">
                                • {brand.name}
                              </div>
                            ))}
                            {subBrands.length === 0 && !openForm && (
                              <p className="px-2 py-1 text-xs text-neutral-400">No brands yet.</p>
                            )}

                            {(() => {
                              const attached = (subcategoryFilterLinks[sub.id] ?? [])
                                .map((id) => filterDefinitions.find((f) => f.id === id))
                                .filter((f): f is FilterDefinition => !!f);
                              if (attached.length === 0) return null;
                              return (
                                <div className="px-2 py-1.5 flex flex-wrap gap-1.5">
                                  {attached.map((f) => (
                                    <FilterChip key={f.id} filter={f} />
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {catSubs.length === 0 && !openForm && (
                    <p className="px-2 py-1 text-xs text-neutral-400">No sub-categories yet.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
