'use client';

import Link from 'next/link';
import { isAuthError } from '@/lib/action-errors';

/**
 * A1 + C1: catches a thrown Server Component render error anywhere under (dashboard) -- e.g. a
 * Shopify 429/timeout/5xx from `shopifyAdminRequest` (which unconditionally throws), or a
 * Supabase failure from `data/customers.ts`/`data/funnel.ts` -- so one failing data source
 * degrades to this friendly "couldn't load, retry" screen instead of Next's raw, unstyled error
 * page. Every route under (dashboard) (/, /products, /products/[id], /customers, /cart,
 * /taxonomy, ...) is covered by this single boundary. Does not catch errors from event handlers
 * or effects (React error boundaries only catch render-phase errors) -- those are handled at
 * their own call sites (see PRODUCT_ERROR_HANDLING_REVIEW.md's other findings).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // requireAdmin() (data/admin-auth.ts) throws a plain Unauthorized/Forbidden Error on session
  // expiry or lost admin access -- distinct from AdminCheckUnavailableError (a transient DB/network
  // failure verifying the session, where the session itself is still valid) and from every other
  // Shopify/Supabase failure. Those two cases need a "log in again" screen, not a "try again" retry
  // button that can never succeed until the admin actually re-authenticates.
  if (isAuthError(error.message)) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border border-dash-card-border bg-dash-card-bg overflow-hidden text-center">
          <div className="px-6 py-8 flex flex-col items-center gap-2">
            <p className="text-sm font-semibold tracking-wide text-amber-600">Session expired</p>
            <h1 className="text-xl font-semibold text-neutral-900">Please log in again</h1>
            <p className="text-sm text-dash-text-muted">
              Your session has expired or you&apos;re no longer signed in as an admin. Log in again
              to continue.
            </p>
            <Link
              href="/login"
              className="mt-4 rounded-md bg-dash-info px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Go to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-dash-card-border bg-dash-card-bg overflow-hidden text-center">
        <div className="px-6 py-8 flex flex-col items-center gap-2">
          <p className="text-sm font-semibold tracking-wide text-red-600">Error</p>
          <h1 className="text-xl font-semibold text-neutral-900">Couldn&apos;t load this page</h1>
          <p className="text-sm text-dash-text-muted">
            Something went wrong loading this data — this is usually a temporary issue with
            Shopify or the database. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-4 rounded-md bg-dash-info px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
