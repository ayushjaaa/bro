/**
 * N-2: `createSalesRepAction`/`createNoteAction` used to forward `error.message` from a caught
 * exception straight to the admin UI -- for a real Supabase/Postgres failure that can carry column
 * or constraint names. Lower severity than the same gap on a customer-facing action (the audience
 * here is trusted staff, not the public), but kept consistent with the rest of the project (see the
 * storefront's own `lib/action-errors.ts`, same design): a `SafeActionError` marks a message as
 * intentionally shown as-is; anything else is logged server-side and replaced by the caller's
 * generic fallback. No `server-only` guard needed -- unlike the data layer, this file holds no
 * secrets or env access, it's pure error classification. Pure -- unit-tested.
 */
export class SafeActionError extends Error {}

export function safeActionError(error: unknown, fallback: string, context: string): string {
  if (error instanceof SafeActionError) return error.message;
  console.error(`[${context}]`, error);
  return fallback;
}

/** requireAdmin() (data/admin-auth.ts) throws these two exact messages on session expiry/loss of
 * admin access -- distinguishing them from every other action error lets the UI tell an admin
 * "log in again" instead of "please try again", which would otherwise send them into an infinite
 * retry loop against a button that can never succeed until they reload and re-authenticate. */
const AUTH_ERROR_MESSAGES = ['Unauthorized — not logged in', 'Forbidden — not an admin'];

export function isAuthError(message: string | null | undefined): boolean {
  return !!message && AUTH_ERROR_MESSAGES.includes(message);
}

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired — please reload the page and log in again.';
