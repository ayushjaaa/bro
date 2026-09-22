import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Service Role client — bypasses RLS. Never expose to the client; only used here. */
function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Thrown when the admin_users lookup itself couldn't be completed (DB/network failure) —
 * distinct from a genuine "not an admin" result. Callers must NOT treat this the same as an
 * unauthenticated/unauthorized user (e.g. must not redirect to /login on it): the session is
 * still valid, we simply failed to verify authorization and should say so, not silently log the
 * user out.
 */
export class AdminCheckUnavailableError extends Error {}

/**
 * DECISIONS.md item 44a-i — the real admin-authorization check. Every data/*.ts function must
 * call this first, before touching Shopify or returning any data.
 *
 * 1. Verifies the caller's session JWT (getClaims() — actually validates, unlike getSession()).
 * 2. Looks up the verified email in admin_users via the Service Role client (bypasses RLS) —
 *    never trusts user metadata or a JWT claim the user could have set themselves.
 *
 * Throws if either check fails — callers should let this propagate (Server Action returns an
 * error to the client) rather than swallow it. Throws AdminCheckUnavailableError specifically
 * when getClaims() or the admin_users lookup query itself errored (retried once first) rather
 * than genuinely finding no session / no matching admin — callers should handle that case
 * separately from a real unauthorized/unauthenticated result (see class doc above).
 */
export async function requireAdmin(): Promise<{ email: string; id: string }> {
  const supabase = await createSupabaseServerClient();

  // getClaims() isn't a pure local check — it can hit the network (refreshing an expired access
  // token, or verifying against the Auth server) and so can fail transiently the same way the
  // admin_users lookup below can. "AuthSessionMissingError" means there's genuinely no session
  // and should NOT be retried; anything else (a fetch/network failure) gets one retry before
  // being treated as a real problem, not immediately as "not logged in".
  let claimsEmail: string | undefined;
  let claimsSub: string | undefined;
  let claimsCheckFailed = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.auth.getClaims();
    if (!error && data?.claims?.email) {
      claimsEmail = data.claims.email as string;
      claimsSub = data.claims.sub as string;
      claimsCheckFailed = false;
      break;
    }
    if (error?.name === 'AuthSessionMissingError') {
      throw new Error('Unauthorized — not logged in');
    }
    // With no session at all, current supabase-js returns { data: null, error: null } (not an error).
    // That is "not logged in", NOT a transient failure -- treating it as one showed a logged-out (or
    // expired-session) visitor a "couldn't verify your session" page instead of sending them to /login.
    if (!error && !data) {
      throw new Error('Unauthorized — not logged in');
    }
    claimsCheckFailed = true;
  }

  if (claimsCheckFailed || !claimsEmail) {
    throw new AdminCheckUnavailableError('Could not verify session — try again');
  }

  const email = claimsEmail;
  const userId = claimsSub as string;
  const service = getServiceRoleClient();

  let adminRow: { id: string } | null = null;
  let lookupFailed = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: row, error: lookupError } = await service
      .from('admin_users')
      .select('id')
      // By the Auth user id (`sub`), never by email: an email claim is not proof of who holds it
      // while sign-up is open (see 024/025). The id can't be chosen by a visitor.
      .eq('user_id', userId)
      .maybeSingle();
    if (!lookupError) {
      adminRow = row;
      lookupFailed = false;
      break;
    }
    lookupFailed = true;
  }

  if (lookupFailed) {
    throw new AdminCheckUnavailableError('Could not verify admin status — try again');
  }

  if (!adminRow) {
    throw new Error('Forbidden — not an admin');
  }

  return { email, id: claimsSub as string };
}

/** DAL — the actual sign-out call. Server Actions call this, never Supabase directly. */
export async function signOutAdmin() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}
