'use client';

import { useState } from 'react';
import { useInventorySnapshotSync } from '../hooks/useInventorySnapshotSync';

/** Live-updating total Stock figure for the product detail page's summary line -- sums each
 * Flavour's live quantity, so a sale on any Flavour updates the total without a manual refresh. */
export default function LiveTotalStock({
  variants,
}: {
  variants: { inventoryItemId: string | null; quantity: number }[];
}) {
  const [quantities, setQuantities] = useState(
    () =>
      new Map(
        variants.filter((v): v is { inventoryItemId: string; quantity: number } => !!v.inventoryItemId).map((v) => [v.inventoryItemId, v.quantity])
      )
  );
  const ids = [...quantities.keys()];

  useInventorySnapshotSync(ids, (inventoryItemId, quantity) => {
    setQuantities((prev) => {
      if (!prev.has(inventoryItemId)) return prev;
      const next = new Map(prev);
      next.set(inventoryItemId, quantity);
      return next;
    });
  });

  const total = [...quantities.values()].reduce((sum, q) => sum + q, 0);
  return <>{total}</>;
}
