/**
 * Admin sign-in arguments arrive from a Server Action, which anyone can POST directly -- so the
 * form's own `type="email"` proves nothing. Only two plain strings of sane length get through to
 * Supabase; anything else is treated exactly like a wrong password (same message, no detail).
 * Pure -- unit-tested.
 */
export const LOGIN_FAILED_MESSAGE = 'Incorrect email or password.';
export const LOGIN_RATE_LIMITED_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.';

const MAX_EMAIL = 254;
const MAX_PASSWORD = 128;

export function parseLoginInput(email: unknown, password: unknown): { email: string; password: string } | null {
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  const trimmed = email.trim();
  if (!trimmed || !password) return null;
  if (trimmed.length > MAX_EMAIL || password.length > MAX_PASSWORD) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return { email: trimmed, password };
}

/** Supabase says why a sign-in failed; only "you are being throttled" is worth showing. */
export function loginErrorMessage(code: string | null | undefined): string {
  return code === 'over_request_rate_limit' ? LOGIN_RATE_LIMITED_MESSAGE : LOGIN_FAILED_MESSAGE;
}
