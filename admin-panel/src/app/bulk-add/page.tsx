"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore, BulkRow } from "@/lib/store";
import TaxonomyPicker from "@/components/TaxonomyPicker";
import ImageSlots from "@/components/ImageSlots";
import { breadcrumbFor } from "@/lib/helpers";

const STRENGTHS = ["", "0mg", "3mg", "6mg", "12mg", "20mg", "35mg", "50mg"];

function emptyRow(): BulkRow {
  return {
    key: Math.random().toString(36).slice(2),
    name: "",
    images: [null, null, null, null],
    price: "",
    nicotineStrength: "",
  };
}

export default function BulkAddPage() {
  const router = useRouter();
  const {
    selectedContext,
    setSelectedContext,
    addFlavorsBulk,
    categories,
    subcategories,
    brands,
    productLines,
  } = useStore();

  const [ctx, setCtx] = useState(selectedContext);
  const [rows, setRows] = useState<BulkRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [defaultPrice, setDefaultPrice] = useState("");
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  const breadcrumb = breadcrumbFor(ctx, categories, subcategories, brands, productLines);
  const validRowCount = rows.filter((r) => r.name.trim()).length;

  function updateRow(key: string, patch: Partial<BulkRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }

  function removeRow(key: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }

  function applyDefaultPrice() {
    if (!defaultPrice.trim()) return;
    setRows((rs) => rs.map((r) => (r.price ? r : { ...r, price: defaultPrice.trim() })));
  }

  function handleCreateAll() {
    if (!ctx.productLineId) return;
    const created = addFlavorsBulk(ctx.productLineId, rows);
    setSelectedContext(ctx);
    setCreatedCount(created.length);
    setRows([emptyRow(), emptyRow(), emptyRow()]);
  }

  return (
    <div className="max-w-5xl mx-auto p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Bulk add flavors</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            One product line, many flavors — add every row in a single action.
          </p>
        </div>
        <button
          onClick={() => router.push("/flavors/new")}
          className="text-sm text-neutral-500 hover:text-neutral-800"
        >
          Prefer one at a time? →
        </button>
      </div>

      {createdCount !== null && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          ✓ Created {createdCount} flavor{createdCount === 1 ? "" : "s"}
          {breadcrumb.length > 0 && (
            <>
              {" "}
              in <strong>{breadcrumb[breadcrumb.length - 1]}</strong>
            </>
          )}
          . Add more below, whenever you&apos;re ready.
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-700">1. Choose the product line</h2>
        <TaxonomyPicker value={ctx} onChange={setCtx} />
      </div>

      {ctx.productLineId ? (
        <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-neutral-700">
              2. List the flavors ({validRowCount})
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400">Default price for empty rows:</span>
              <input
                value={defaultPrice}
                onChange={(e) => setDefaultPrice(e.target.value)}
                placeholder="19.99"
                className="w-20 rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-emerald-500"
              />
              <button
                onClick={applyDefaultPrice}
                className="text-xs text-emerald-700 hover:underline font-medium"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-neutral-500 text-xs uppercase tracking-wide">
                  <th className="px-5 py-2 font-medium">Flavor name</th>
                  <th className="px-3 py-2 font-medium">Images</th>
                  <th className="px-3 py-2 font-medium w-28">Price</th>
                  <th className="px-3 py-2 font-medium w-28">Strength</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.key} className="border-b border-neutral-50 last:border-0 align-top">
                    <td className="px-5 py-2.5">
                      <input
                        value={row.name}
                        onChange={(e) => updateRow(row.key, { name: e.target.value })}
                        placeholder={`Flavor ${idx + 1} name`}
                        className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <ImageSlots
                        compact
                        images={row.images}
                        onChange={(images) => updateRow(row.key, { images })}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">$</span>
                        <input
                          value={row.price}
                          onChange={(e) => updateRow(row.key, { price: e.target.value })}
                          placeholder="0.00"
                          className="w-full rounded border border-neutral-300 pl-5 pr-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={row.nicotineStrength}
                        onChange={(e) => updateRow(row.key, { nicotineStrength: e.target.value })}
                        className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-500 bg-white"
                      >
                        {STRENGTHS.map((s) => (
                          <option key={s} value={s}>
                            {s || "—"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => removeRow(row.key)}
                        className="text-neutral-300 hover:text-red-500 text-sm"
                        title="Remove row"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-neutral-100 flex items-center justify-between">
            <button
              onClick={addRow}
              className="rounded-md border border-neutral-300 bg-white text-neutral-700 text-sm font-medium px-3 py-1.5 hover:bg-neutral-50"
            >
              + Add row
            </button>
            <button
              onClick={handleCreateAll}
              disabled={validRowCount === 0}
              className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              Create All ({validRowCount} flavor{validRowCount === 1 ? "" : "s"})
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          Select a category → sub-category → brand → product line above to start the flavor list.
        </div>
      )}
    </div>
  );
}
