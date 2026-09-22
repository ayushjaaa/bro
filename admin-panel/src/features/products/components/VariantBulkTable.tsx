'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { bulkCreateVariantsAction } from '../actions';
import { validatePriceInput, validateQuantityInput } from '@/lib/variant-input';

type Row = {
  id: number;
  flavourName: string;
  description: string;
  price: string;
  compareAtPrice: string;
  retailPrice: string;
  sku: string;
  quantity: string;
  image: File | null;
};

type RowErrors = Partial<Record<keyof Row, string>>;

const BLANK_ROW: Omit<Row, 'id'> = {
  flavourName: '',
  description: '',
  price: '',
  compareAtPrice: '',
  retailPrice: '',
  sku: '',
  quantity: '',
  image: null,
};

function draftKey(productId: string) {
  return `variant-draft:${productId}`;
}

/** A row with nothing entered yet (the default blank starter row, or one a draft-reload left
 * empty) shouldn't be flagged with a wall of "Required" errors -- only rows the admin has
 * actually started filling in get validated. */
function isRowTouched(row: Row): boolean {
  return (
    row.flavourName.trim() !== '' ||
    row.description.trim() !== '' ||
    row.price.trim() !== '' ||
    row.compareAtPrice.trim() !== '' ||
    row.retailPrice.trim() !== '' ||
    row.sku.trim() !== '' ||
    row.quantity.trim() !== '' ||
    row.image !== null
  );
}

/** Every field is required except Compare-at (the one genuinely optional field, used only to show
 * a strikethrough "was $X" price). Price and Quantity must be greater than 0 -- a $0 Flavour or
 * one with 0 stock isn't a real sellable state. Compare-at, when given, must be less than Price,
 * otherwise Shopify's storefront would render a "discount" that's actually a markup. */
function validateRow(row: Row): RowErrors {
  const errors: RowErrors = {};

  if (!row.flavourName.trim()) errors.flavourName = 'Required';
  if (!row.description.trim()) errors.description = 'Required';
  if (!row.sku.trim()) errors.sku = 'Required';
  // TEMPORARY (testing only, per explicit request) -- image left optional so 100 rows can be
  // Created without a photo per row first. Put `if (!row.image) errors.image = 'Required';` back
  // as soon as testing is done -- the backend (data/variants.ts) already treats image as optional
  // on its own, so this was purely a frontend guard.

  const priceError = validatePriceInput(row.price);
  if (priceError) errors.price = priceError;

  const quantityError = validateQuantityInput(row.quantity);
  if (quantityError) errors.quantity = quantityError;

  if (row.compareAtPrice.trim()) {
    const compareAtPrice = Number(row.compareAtPrice);
    if (!Number.isFinite(compareAtPrice)) {
      errors.compareAtPrice = 'Invalid number';
    } else if (!errors.price && compareAtPrice >= Number(row.price)) {
      errors.compareAtPrice = 'Must be < Price';
    }
  }

  // Retail Price is optional (missing = retail customers fall back to Wholesale Price) -- only a
  // malformed number blocks submission here. "Retail should be >= Wholesale" is a soft warning
  // (see rowRetailWarning below), not blocked, since a legitimate reason to deviate could exist.
  if (row.retailPrice.trim() && !Number.isFinite(Number(row.retailPrice))) {
    errors.retailPrice = 'Invalid number';
  }

  return errors;
}

/** Non-blocking warning: retail price should normally be at or above wholesale, but this doesn't
 * stop the row from being saved (e.g. a legitimate clearance/parity-priced item). */
function rowRetailWarning(row: Row): string | null {
  if (!row.retailPrice.trim() || !row.price.trim()) return null;
  const retail = Number(row.retailPrice);
  const wholesale = Number(row.price);
  if (!Number.isFinite(retail) || !Number.isFinite(wholesale)) return null;
  return retail < wholesale ? 'Below Wholesale' : null;
}

const inputClass = (hasError: boolean, locked: boolean) =>
  `w-full rounded border px-1.5 py-1 text-xs ${
    locked
      ? 'border-emerald-200 bg-emerald-50/60 text-neutral-500 cursor-not-allowed'
      : hasError
        ? 'border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400'
        : 'border-neutral-300'
  }`;

/** Spreadsheet-style bulk Flavour entry (Flow C). Region is no longer a per-row field
 * (PRODUCT_PAGE_PLAN.md §11) -- this table is always scoped to one already-region-specific
 * Product Line (the admin picked regions when creating the Product Line, one Product per region),
 * so every row here only needs Flavour/Description/Price/etc. Draft (text fields only, not File
 * images) autosaves to localStorage per Product Line so a closed tab doesn't lose entered rows.
 *
 * Once "Create All" succeeds, the rows that were just sent to Shopify get locked in place (green
 * tint, read-only, no Remove) instead of being cleared -- they're now real variants, not draft
 * data, so editing them here wouldn't do anything to Shopify anyway. Only rows added afterward
 * (via "+ Add row") stay editable. */
export default function VariantBulkTable({
  productId,
  numericId,
  productTitle,
}: {
  productId: string;
  numericId: string;
  productTitle: string;
}) {
  const nextRowId = useRef(1);
  const [rows, setRows] = useState<Row[]>([{ ...BLANK_ROW, id: 0 }]);
  const [bulkPrice, setBulkPrice] = useState('');
  const [createdIds, setCreatedIds] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ created: number; failed: number; errors: string[] } | null>(
    null
  );
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem(draftKey(numericId));
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Array<Omit<Row, 'image' | 'id'> & { id?: number }>;
        if (parsed.length > 0) {
          const restored = parsed.map((r, i) => ({ ...r, id: r.id ?? i, image: null }));
          nextRowId.current = Math.max(...restored.map((r) => r.id)) + 1;
          setRows(restored);
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

  function updateRow(id: number, patch: Partial<Row>) {
    if (createdIds.has(id)) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...BLANK_ROW, id: nextRowId.current++ }]);
  }

  function removeRow(id: number) {
    if (createdIds.has(id)) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  /** Generates 100 rows named "1".."100" -- Price/Compare-at/Quantity are the same across all 100
   * (Price from the `bulkPrice` input since there's no single sensible default to guess; Compare-at
   * fixed at "0", Quantity fixed at "2" per what was asked for), SKU unique per row so Shopify
   * never rejects a duplicate. Image is deliberately left blank on every row -- a File can't be
   * generated, only picked by the admin per-row in the table afterward. Appends rather than
   * replacing existing rows, so it's safe to click even if the starter blank row (or an
   * already-filled one) is still there -- an untouched row is silently excluded from submission
   * anyway (see isRowTouched/validRows above). */
  function generateHundredRows() {
    const newRows: Row[] = Array.from({ length: 100 }, (_, i) => {
      const n = i + 1;
      return {
        id: nextRowId.current++,
        flavourName: String(n),
        description: String(n),
        price: bulkPrice,
        compareAtPrice: '0',
        retailPrice: '',
        sku: `${numericId}-${n}`,
        quantity: '2',
        image: null,
      };
    });
    setRows((prev) => [...prev, ...newRows]);
  }

  const editableRows = rows.filter((r) => !createdIds.has(r.id));
  const rowValidations = new Map(
    editableRows.map((row) => [row.id, { touched: isRowTouched(row), errors: validateRow(row) }])
  );
  const hasBlockingErrors = editableRows.some((row) => {
    const v = rowValidations.get(row.id)!;
    return v.touched && Object.keys(v.errors).length > 0;
  });
  const validRows = editableRows.filter((row) => {
    const v = rowValidations.get(row.id)!;
    return v.touched && Object.keys(v.errors).length === 0;
  });
  const canSubmit = !hasBlockingErrors && validRows.length > 0 && !pending;

  function handleSubmit() {
    if (!canSubmit) return;
    setResult(null);

    const formData = new FormData();
    formData.set('productId', productId);
    formData.set('rowCount', String(validRows.length));
    validRows.forEach((row, i) => {
      formData.set(`row:${i}:flavourName`, row.flavourName);
      formData.set(`row:${i}:description`, row.description);
      formData.set(`row:${i}:price`, row.price);
      formData.set(`row:${i}:sku`, row.sku);
      formData.set(`row:${i}:quantity`, row.quantity);
      if (row.compareAtPrice) formData.set(`row:${i}:compareAtPrice`, row.compareAtPrice);
      if (row.retailPrice) formData.set(`row:${i}:retailPrice`, row.retailPrice);
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
          setCreatedIds((prev) => new Set([...prev, ...validRows.map((r) => r.id)]));
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
              <th className="text-left px-3 py-2 font-medium">Wholesale Price</th>
              <th className="text-left px-3 py-2 font-medium">Compare-at</th>
              <th className="text-left px-3 py-2 font-medium">Retail Price</th>
              <th className="text-left px-3 py-2 font-medium">Quantity</th>
              <th className="text-left px-3 py-2 font-medium">SKU</th>
              <th className="text-left px-3 py-2 font-medium">Image</th>
              <th className="text-left px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row) => {
              const locked = createdIds.has(row.id);
              const v = rowValidations.get(row.id);
              const showErrors = !locked && !!v?.touched;
              const errors = v?.errors ?? {};
              return (
                <tr key={row.id} className={locked ? 'bg-emerald-50/40' : ''}>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      value={row.flavourName}
                      onChange={(e) => updateRow(row.id, { flavourName: e.target.value })}
                      placeholder="e.g. Blue Razz"
                      disabled={locked}
                      className={`w-32 ${inputClass(showErrors && !!errors.flavourName, locked)}`}
                    />
                    {showErrors && errors.flavourName && (
                      <p className="text-[10px] text-red-600 mt-0.5">{errors.flavourName}</p>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      value={row.description}
                      onChange={(e) => updateRow(row.id, { description: e.target.value })}
                      disabled={locked}
                      className={`w-32 ${inputClass(showErrors && !!errors.description, locked)}`}
                    />
                    {showErrors && errors.description && (
                      <p className="text-[10px] text-red-600 mt-0.5">{errors.description}</p>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      value={row.price}
                      onChange={(e) => updateRow(row.id, { price: e.target.value })}
                      placeholder="0.00"
                      disabled={locked}
                      className={`w-16 ${inputClass(showErrors && !!errors.price, locked)}`}
                    />
                    {showErrors && errors.price && (
                      <p className="text-[10px] text-red-600 mt-0.5">{errors.price}</p>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      value={row.compareAtPrice}
                      onChange={(e) => updateRow(row.id, { compareAtPrice: e.target.value })}
                      placeholder="0.00"
                      disabled={locked}
                      className={`w-16 ${inputClass(showErrors && !!errors.compareAtPrice, locked)}`}
                    />
                    {showErrors && errors.compareAtPrice && (
                      <p className="text-[10px] text-red-600 mt-0.5">{errors.compareAtPrice}</p>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      value={row.retailPrice}
                      onChange={(e) => updateRow(row.id, { retailPrice: e.target.value })}
                      placeholder="0.00"
                      disabled={locked}
                      className={`w-16 ${inputClass(showErrors && !!errors.retailPrice, locked)}`}
                    />
                    {showErrors && errors.retailPrice && (
                      <p className="text-[10px] text-red-600 mt-0.5">{errors.retailPrice}</p>
                    )}
                    {!showErrors && !locked && rowRetailWarning(row) && (
                      <p className="text-[10px] text-amber-600 mt-0.5">{rowRetailWarning(row)}</p>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      value={row.quantity}
                      onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                      placeholder="0"
                      disabled={locked}
                      className={`w-16 ${inputClass(showErrors && !!errors.quantity, locked)}`}
                    />
                    {showErrors && errors.quantity && (
                      <p className="text-[10px] text-red-600 mt-0.5">{errors.quantity}</p>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      value={row.sku}
                      onChange={(e) => updateRow(row.id, { sku: e.target.value })}
                      disabled={locked}
                      className={`w-20 ${inputClass(showErrors && !!errors.sku, locked)}`}
                    />
                    {showErrors && errors.sku && <p className="text-[10px] text-red-600 mt-0.5">{errors.sku}</p>}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    {!locked && (
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => updateRow(row.id, { image: e.target.files?.[0] ?? null })}
                        className="w-24 text-xs"
                      />
                    )}
                    {/* File inputs can't be pre-filled via JS (browser security) -- if a duplicated
                     * row already carries an image in state, the input itself will misleadingly
                     * show "No file chosen", so surface it explicitly here. */}
                    {row.image && !locked && (
                      <p className="text-[10px] text-emerald-600 mt-0.5">✓ {row.image.name}</p>
                    )}
                    {showErrors && errors.image && <p className="text-[10px] text-red-600 mt-0.5">{errors.image}</p>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap align-top">
                    {locked ? (
                      <span className="text-xs text-emerald-700 font-medium">✓ Created</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
        <span className="text-xs text-neutral-600">Price for all 100:</span>
        <input
          value={bulkPrice}
          onChange={(e) => setBulkPrice(e.target.value)}
          placeholder="0.00"
          className="w-20 rounded border border-neutral-300 px-1.5 py-1 text-xs"
        />
        <button
          type="button"
          onClick={generateHundredRows}
          disabled={!bulkPrice.trim() || Number(bulkPrice) <= 0}
          className="rounded-md bg-neutral-800 text-white text-xs font-medium px-3 py-1.5 hover:bg-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Generate 100 Rows
        </button>
        <span className="text-xs text-neutral-500">
          Names 1–100, Compare-at $0, Quantity 2, unique SKU per row — fill in each row&apos;s image yourself, then Create All.
        </span>
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
          disabled={!canSubmit}
          className="rounded-md bg-emerald-600 text-white text-xs font-medium px-4 py-1.5 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'Creating...' : `Create All (${validRows.length})`}
        </button>
        {hasBlockingErrors && (
          <span className="text-xs text-red-600">Fix the highlighted fields before creating.</span>
        )}
        {!hasBlockingErrors && validRows.length === 0 && (
          <span className="text-xs text-neutral-500">Add at least one Flavour with every required field filled in.</span>
        )}
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
