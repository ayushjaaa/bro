'use client';

import { useState } from 'react';
import { useInventorySnapshotSync } from '../hooks/useInventorySnapshotSync';

/** Live-updating Stock cell for a single Flavour on the product detail page -- reuses the same
 * webhook -> Supabase Realtime pipeline as Edit Flavours, so a sale shows up here too without a
 * manual refresh. */
export default function LiveVariantStock({
  inventoryItemId,
  quantity,
}: {
  inventoryItemId: string | null;
  quantity: number;
}) {
  const [qty, setQty] = useState(quantity);

  useInventorySnapshotSync(inventoryItemId ? [inventoryItemId] : [], (id, q) => {
    if (id === inventoryItemId) setQty(q);
  });

  return qty === 0 ? (
    <span className="text-amber-700 font-medium">0</span>
  ) : (
    <span className="text-neutral-600">{qty}</span>
  );
}
