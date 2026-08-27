'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { publishProductLineAction, unpublishProductLineAction } from '../actions';

/** Publish/Unpublish is always an explicit, admin-triggered action -- never automatic (§0a).
 * Publish is only offered when variantCount > 0 (a 0-flavour Product Line going live is a real
 * incomplete state, not something to publish); the caller (page) enforces that by not rendering
 * this component at all in that case. */
export default function PublishButton({
  productId,
  isPublished,
}: {
  productId: string;
  isPublished: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('productId', productId);
        if (isPublished) {
          await unpublishProductLineAction(formData);
        } else {
          await publishProductLineAction(formData);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed.');
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`text-xs font-medium px-3 py-1.5 rounded-md border disabled:opacity-50 ${
          isPublished
            ? 'border-neutral-300 text-neutral-600 hover:bg-neutral-100'
            : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
        }`}
      >
        {pending ? '...' : isPublished ? 'Unpublish' : 'Publish'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
