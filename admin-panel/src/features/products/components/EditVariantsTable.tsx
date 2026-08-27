'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { REGIONS } from '@/lib/regions';
import { updateVariantsAction } from '../actions';
import AddStockButton from './AddStockButton';
import { useInventorySnapshotSync } from '../hooks/useInventorySnapshotSync';

type Row = {
  id: string;
  inventoryItemId: string | null;
  title: string;
  description: string;
  region: string;
  price: string;
  compareAtPrice: string;
  sku: string;
  quantity: string;
  /** The quantity Shopify had when this row loaded -- sent as `changeFromQuantity` so
   * inventorySetQuantities' compare-and-set check succeeds (never edited by the user). */
  originalQuantity: number;
  isActivatedAtLocation: boolean;
  dirty: boolean;
};

export type EditableVariant = {
  id: string;
  inventoryItemId: string | null;
  title: string;
  price: string;
  compareAtPrice: string | null;
  sku: string | null;
  quantity: number;
  isActivatedAtLocation: boolean;
  region: string | null;
  flavourDescription: string | null;
};

/** Edit existing Flavours -- one table serves both a single-Flavour edit (per-row "Save") and a
 * bulk edit ("Save All Changes"), since updateVariantsAction accepts one row or many the same
 * way (§ user request 2026-08-25). Flavour name itself isn't editable here (that's the Shopify
 * option value, a separate/more involved update) -- only its region, description, price,
 * compare-at, quantity, and SKU. */
export default function EditVariantsTable({
  productId,
  variants,
}: {
  productId: string;
  variants: EditableVariant[];
}) {
  const [rows, setRows] = useState<Row[]>(
    variants.map((v) => ({
      id: v.id,
      inventoryItemId: v.inventoryItemId,
      title: v.title,
      description: v.flavourDescription ?? '',
      region: v.region ?? REGIONS[0].value,
      price: v.price,
      compareAtPrice: v.compareAtPrice ?? '',
      sku: v.sku ?? '',
      quantity: String(v.quantity),
      originalQuantity: v.quantity,
      isActivatedAtLocation: v.isActivatedAtLocation,
      dirty: false,
    }))
  );
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [savingAll, startSavingAll] = useTransition();
  const [result, setResult] = useState<{ ok: number; failed: number; errors: string[] } | null>(null);
  const router = useRouter();

  const inventoryItemIds = rows.map((r) => r.inventoryItemId).filter((id): id is string => !!id);

  // Live stock updates (webhook -> Supabase Realtime, see plan doc) -- only ever applied to rows
  // the admin isn't actively mid-edit on, so a real sale elsewhere never clobbers an unsaved
  // change here. A save-in-flight is also protected: `dirty` only flips back to false *after*
  // saveRows resolves, so an event arriving mid-save is dropped and the save's own patch wins.
  useInventorySnapshotSync(inventoryItemIds, (inventoryItemId, quantity) => {
    setRows((prev) =>
      prev.map((r) =>
        r.inventoryItemId !== inventoryItemId || r.dirty
          ? r
          : { ...r, quantity: String(quantity), originalQuantity: quantity }
      )
    );
  });

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch, dirty: true } : r)));
  }

  function buildFormData(rowsToSave: Row[]) {
    const formData = new FormData();
    formData.set('productId', productId);
    formData.set('rowCount', String(rowsToSave.length));
    rowsToSave.forEach((row, i) => {
      formData.set(`row:${i}:id`, row.id);
      if (row.inventoryItemId) formData.set(`row:${i}:inventoryItemId`, row.inventoryItemId);
      formData.set(`row:${i}:description`, row.description);
      formData.set(`row:${i}:region`, row.region);
      formData.set(`row:${i}:price`, row.price);
      if (row.compareAtPrice) formData.set(`row:${i}:compareAtPrice`, row.compareAtPrice);
      if (row.sku) formData.set(`row:${i}:sku`, row.sku);
      formData.set(`row:${i}:quantity`, row.quantity);
      formData.set(`row:${i}:currentQuantity`, String(row.originalQuantity));
      formData.set(`row:${i}:isActivatedAtLocation`, String(row.isActivatedAtLocation));
    });
    return formData;
  }

  async function saveRows(rowsToSave: Row[], clearDirtyIds: Set<string>) {
    setResult(null);
    try {
      const res = await updateVariantsAction(buildFormData(rowsToSave));
      setResult({ ok: res.created, failed: res.failed, errors: res.errors.map((e) => e.message) });
      if (res.failed === 0) {
        // Also refresh each saved row's `originalQuantity` baseline to what was just written --
        // router.refresh() re-fetches server data but doesn't reset this component's own local
        // state, so a second edit-and-save later in the same visit needs the right baseline for
        // inventorySetQuantities' changeFromQuantity check, not the stale value from page-load.
        setRows((prev) =>
          prev.map((r) =>
            clearDirtyIds.has(r.id)
              ? {
                  ...r,
                  dirty: false,
                  originalQuantity: parseInt(r.quantity, 10) || 0,
                  // First-time activation only works once -- inventoryActivate errors on a
                  // second call for the same location, so mark it activated now so a later edit
                  // in the same visit correctly uses inventorySetQuantities instead.
                  isActivatedAtLocation: true,
                }
              : r
          )
        );
        router.refresh();
      }
    } catch (err) {
      setResult({ ok: 0, failed: rowsToSave.length, errors: [err instanceof Error ? err.message : 'Save failed.'] });
    }
  }

  function saveOneRow(row: Row) {
    setPendingRowId(row.id);
    saveRows([row], new Set([row.id])).finally(() => setPendingRowId(null));
  }

  function saveAll() {
    const dirtyRows = rows.filter((r) => r.dirty);
    if (dirtyRows.length === 0) return;
    startSavingAll(() => {
      saveRows(dirtyRows, new Set(dirtyRows.map((r) => r.id)));
    });
  }

  const dirtyCount = rows.filter((r) => r.dirty).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm min-w-[950px]">
          <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Flavour</th>
              <th className="text-left px-3 py-2 font-medium">Description</th>
              <th className="text-left px-3 py-2 font-medium">Region</th>
              <th className="text-left px-3 py-2 font-medium">Price</th>
              <th className="text-left px-3 py-2 font-medium">Compare-at</th>
              <th className="text-left px-3 py-2 font-medium">Quantity</th>
              <th className="text-left px-3 py-2 font-medium">SKU</th>
              <th className="text-left px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row, i) => (
              <tr key={row.id} className={row.dirty ? 'bg-amber-50/40' : undefined}>
                <td className="px-3 py-1.5 text-neutral-800">{row.title}</td>
                <td className="px-2 py-1.5">
                  <input
                    value={row.description}
                    onChange={(e) => updateRow(i, { description: e.target.value })}
                    className="w-32 rounded border border-neutral-300 px-1.5 py-1 text-xs"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={row.region}
                    onChange={(e) => updateRow(i, { region: e.target.value })}
                    className="rounded border border-neutral-300 px-1.5 py-1 text-xs"
                  >
                    {REGIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={row.price}
                    onChange={(e) => updateRow(i, { price: e.target.value })}
                    className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-xs"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={row.compareAtPrice}
                    onChange={(e) => updateRow(i, { compareAtPrice: e.target.value })}
                    placeholder="0.00"
                    className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-xs"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={row.quantity}
                    onChange={(e) => updateRow(i, { quantity: e.target.value })}
                    className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-xs"
                  />
                  <div className="mt-1">
                    <AddStockButton
                      productId={productId}
                      inventoryItemId={row.inventoryItemId}
                      currentQuantity={parseInt(row.quantity, 10) || 0}
                      onAdjusted={(newQuantity) => {
                        setRows((prev) =>
                          prev.map((r, ri) =>
                            ri === i
                              ? { ...r, quantity: String(newQuantity), originalQuantity: newQuantity }
                              : r
                          )
                        );
                        router.refresh();
                      }}
                    />
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={row.sku}
                    onChange={(e) => updateRow(i, { sku: e.target.value })}
                    className="w-20 rounded border border-neutral-300 px-1.5 py-1 text-xs"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => saveOneRow(row)}
                    disabled={!row.dirty || pendingRowId === row.id}
                    className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    {pendingRowId === row.id ? 'Saving...' : 'Save'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={saveAll}
          disabled={dirtyCount === 0 || savingAll}
          className="rounded-md bg-emerald-600 text-white text-xs font-medium px-4 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
        >
          {savingAll ? 'Saving...' : `Save All Changes (${dirtyCount})`}
        </button>
        {dirtyCount === 0 && <span className="text-xs text-neutral-400">No unsaved changes.</span>}
      </div>

      {result && (
        <div
          className={`text-sm rounded-md px-3 py-2 border ${
            result.failed === 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          Updated {result.ok}, failed {result.failed}.
          {result.errors.length > 0 && (
            <ul className="list-disc list-inside mt-1">
              {result.errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
