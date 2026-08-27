'use client';

import { useState, useTransition } from 'react';
import { adjustVariantQuantityAction } from '../actions';

/** Small inline "+ Add Stock" control (restock, e.g. "+20 just arrived") -- a relative delta,
 * distinct from Edit Flavours' main Quantity field ("set to N"). Only meaningful once a variant
 * is already activated at the inventory location (a fresh, never-stocked variant should get its
 * first quantity via the main Quantity field instead, which activates it). */
export default function AddStockButton({
  productId,
  inventoryItemId,
  currentQuantity,
  disabled,
  onAdjusted,
}: {
  productId: string;
  inventoryItemId: string | null;
  currentQuantity: number;
  disabled?: boolean;
  onAdjusted: (newQuantity: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    const deltaNum = parseInt(delta, 10);
    if (!deltaNum || !inventoryItemId) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set('productId', productId);
      formData.set('inventoryItemId', inventoryItemId);
      formData.set('delta', String(deltaNum));
      formData.set('currentQuantity', String(currentQuantity));

      const res = await adjustVariantQuantityAction(formData);
      if (res.ok) {
        onAdjusted(currentQuantity + deltaNum);
        setDelta('');
        setOpen(false);
      } else {
        setError(res.error ?? 'Failed to add stock.');
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || !inventoryItemId}
        className="text-[11px] text-sky-700 hover:underline disabled:opacity-40 disabled:no-underline"
        title={!inventoryItemId ? 'Save this row once first' : 'Restock (add to current quantity)'}
      >
        + Add Stock
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <input
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder="+20"
          className="w-12 rounded border border-neutral-300 px-1 py-0.5 text-[11px]"
          autoFocus
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending || !delta}
          className="text-[11px] font-medium text-emerald-700 hover:underline disabled:opacity-40"
        >
          {pending ? '...' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setDelta('');
            setError(null);
          }}
          className="text-[11px] text-neutral-400 hover:underline"
        >
          ×
        </button>
      </div>
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
