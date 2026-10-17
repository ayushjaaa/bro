'use client';

import { useState, useTransition } from 'react';
import { toggleFeaturedAction } from '../actions';
import type { FeaturedCollectionKey } from '@/data/featured-collections';

const LABELS: Record<FeaturedCollectionKey, string> = {
  trending: 'Show in Trending',
  promotions: 'Show in Promotions',
};

export default function FeaturedToggle({
  productId,
  productDetailPathId,
  initial,
}: {
  productId: string;
  /** The `[id]` route param (numeric part of the GID) -- used to revalidate this same detail
   * page after a toggle, same pattern as PublishButton's `router.refresh()`. */
  productDetailPathId: string;
  initial: Record<FeaturedCollectionKey, boolean>;
}) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle(key: FeaturedCollectionKey) {
    const next = !state[key];
    setError(null);
    setState((s) => ({ ...s, [key]: next })); // optimistic -- Shopify's add/remove runs as a background job
    startTransition(async () => {
      const result = await toggleFeaturedAction(productId, key, next, productDetailPathId);
      if (!result.ok) {
        setState((s) => ({ ...s, [key]: !next })); // revert on failure
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {(Object.keys(LABELS) as FeaturedCollectionKey[]).map((key) => (
        <label key={key} className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
          <input
            type="checkbox"
            checked={state[key]}
            disabled={pending}
            onChange={() => handleToggle(key)}
            className="rounded border-neutral-300"
          />
          {LABELS[key]}
        </label>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
