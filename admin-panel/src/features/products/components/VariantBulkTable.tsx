'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { REGIONS } from '@/lib/regions';
import { bulkCreateVariantsAction } from '../actions';

type Row = {
  flavourName: string;
  description: string;
  region: string;
  price: string;
  compareAtPrice: string;
  sku: string;
  quantity: string;
  image: File | null;
};

const EMPTY_ROW: Row = {
  flavourName: '',
  description: '',
  region: REGIONS[0].value,
  price: '',
  compareAtPrice: '',
  sku: '',
  quantity: '',
  image: null,
};

function draftKey(productId: string) {
  return `variant-draft:${productId}`;
}

/** Spreadsheet-style bulk Flavour entry (Flow C). Region is a fixed 6-value dropdown, never free
 * text (§0 fact 2). "Duplicate to other regions" clones a row's Flavour/Description/Price across
 * the 5 remaining regions in one click, since 200 flavours x 6 regions is the expected real
 * scale. Draft (text fields only, not File images) autosaves to localStorage per Product Line so
 * a closed tab doesn't lose entered rows. */
export default function VariantBulkTable({
  productId,
  numericId,
  productTitle,
}: {
  productId: string;
  numericId: string;
  productTitle: string;
}) {
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ created: number; failed: number; errors: string[] } | null>(
    null
  );
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem(draftKey(numericId));
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Omit<Row, 'image'>[];
        if (parsed.length > 0) {
          setRows(parsed.map((r) => ({ ...r, image: null })));
        }
      } catch {
        // ignore corrupt draft
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const toSave = rows.map(({ image: _image, ...rest }) => rest);
    localStorage.setItem(draftKey(numericId), JSON.stringify(toSave));
  }, [rows, numericId]);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function duplicateToOtherRegions(index: number) {
    const source = rows[index];
    const usedRegions = new Set(
      rows.filter((r) => r.flavourName === source.flavourName).map((r) => r.region)
    );
    const newRows = REGIONS.filter((r) => !usedRegions.has(r.value)).map((r) => ({
      ...source,
      region: r.value,
      // Carry the same image forward -- packaging/photo is normally identical across regions
      // (only the excise stamp differs internally), and a File reference is safely reusable
      // across multiple rows in React state. Admin can still override per-row if one region
      // genuinely needs a different photo.
    }));
    if (newRows.length === 0) return;
    setRows((prev) => [...prev, ...newRows]);
  }

  function handleSubmit() {
    setResult(null);
    const validRows = rows.filter((r) => r.flavourName.trim() && r.price.trim());
    if (validRows.length === 0) return;

    const formData = new FormData();
    formData.set('productId', productId);
    formData.set('rowCount', String(validRows.length));
    validRows.forEach((row, i) => {
      formData.set(`row:${i}:flavourName`, row.flavourName);
      formData.set(`row:${i}:description`, row.description);
      formData.set(`row:${i}:region`, row.region);
      formData.set(`row:${i}:price`, row.price);
      if (row.compareAtPrice) formData.set(`row:${i}:compareAtPrice`, row.compareAtPrice);
      if (row.sku) formData.set(`row:${i}:sku`, row.sku);
      if (row.quantity) formData.set(`row:${i}:quantity`, row.quantity);
      if (row.image) formData.set(`row:${i}:image`, row.image);
    });

    startTransition(async () => {
      try {
        const res = await bulkCreateVariantsAction(formData);
        setResult({
          created: res.created,
          failed: res.failed,
          errors: res.errors.map((e) => e.message),
        });
        if (res.failed === 0) {
          localStorage.removeItem(draftKey(numericId));
          router.refresh();
        }
      } catch (err) {
        setResult({
          created: 0,
          failed: validRows.length,
          errors: [err instanceof Error ? err.message : 'Unexpected error creating flavours.'],
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Flavour</th>
              <th className="text-left px-3 py-2 font-medium">Description</th>
              <th className="text-left px-3 py-2 font-medium">Region</th>
              <th className="text-left px-3 py-2 font-medium">Price</th>
              <th className="text-left px-3 py-2 font-medium">Compare-at</th>
              <th className="text-left px-3 py-2 font-medium">Quantity</th>
              <th className="text-left px-3 py-2 font-medium">SKU</th>
              <th className="text-left px-3 py-2 font-medium">Image</th>
              <th className="text-left px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="px-2 py-1.5">
                  <input
                    value={row.flavourName}
                    onChange={(e) => updateRow(i, { flavourName: e.target.value })}
                    placeholder="e.g. Blue Razz"
                    className="w-32 rounded border border-neutral-300 px-1.5 py-1 text-xs"
                  />
                </td>
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
                    placeholder="0.00"
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
                    placeholder="0"
                    className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-xs"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={row.sku}
                    onChange={(e) => updateRow(i, { sku: e.target.value })}
                    className="w-20 rounded border border-neutral-300 px-1.5 py-1 text-xs"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => updateRow(i, { image: e.target.files?.[0] ?? null })}
                    className="w-24 text-xs"
                  />
                  {/* File inputs can't be pre-filled via JS (browser security) -- if a duplicated
                   * row already carries an image in state, the input itself will misleadingly
                   * show "No file chosen", so surface it explicitly here. */}
                  {row.image && (
                    <p className="text-[10px] text-emerald-600 mt-0.5">✓ {row.image.name}</p>
                  )}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => duplicateToOtherRegions(i)}
                    title="Duplicate to other regions"
                    className="text-xs text-sky-700 hover:underline mr-2"
                  >
                    Dup regions
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
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
          onClick={addRow}
          className="rounded-md border border-neutral-300 text-xs font-medium px-3 py-1.5 hover:bg-neutral-100"
        >
          + Add row
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="rounded-md bg-emerald-600 text-white text-xs font-medium px-4 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? 'Creating...' : `Create All (${rows.filter((r) => r.flavourName.trim()).length})`}
        </button>
      </div>

      {result && (
        <div
          className={`text-sm rounded-md px-3 py-2 border ${
            result.failed === 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          Created {result.created}, failed {result.failed} for &quot;{productTitle}&quot;.
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
