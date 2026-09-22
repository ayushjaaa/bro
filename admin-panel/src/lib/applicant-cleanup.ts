/**
 * Rules for the storefront's "registration failed half-way, remove the orphan Auth user" request
 * (api/internal/delete-applicant). Deleting an Auth user is destructive, so even a caller holding
 * the shared secret may only remove an account that is, provably, an unfinished sign-up:
 *   - not an admin, and
 *   - has no `customers` row (no application exists), and
 *   - was created moments ago (the failed submit that is asking for cleanup).
 * A leaked secret therefore cannot be used to delete real customers or admins. Pure -- unit-tested.
 */
export const CLEANUP_WINDOW_MS = 15 * 60 * 1000;
export const MAX_CLEANUP_BODY_CHARS = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The body must be exactly `{ "userId": "<uuid>" }` (extra keys are refused). */
export function parseCleanupInput(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== 'userId') return null;
  const userId = (raw as { userId: unknown }).userId;
  return typeof userId === 'string' && UUID.test(userId) ? userId.toLowerCase() : null;
}

export type CleanupDecision =
  | { ok: true }
  | { ok: false; reason: 'is_admin' | 'has_application' | 'bad_date' | 'too_old' };

export function decideCleanup(input: {
  createdAt: string | null | undefined;
  hasCustomerRow: boolean;
  isAdmin: boolean;
  now?: number;
}): CleanupDecision {
  if (input.isAdmin) return { ok: false, reason: 'is_admin' };
  if (input.hasCustomerRow) return { ok: false, reason: 'has_application' };
  const created = input.createdAt ? Date.parse(input.createdAt) : NaN;
  const now = input.now ?? Date.now();
  if (!Number.isFinite(created) || created > now + 60_000) return { ok: false, reason: 'bad_date' };
  if (now - created > CLEANUP_WINDOW_MS) return { ok: false, reason: 'too_old' };
  return { ok: true };
}
