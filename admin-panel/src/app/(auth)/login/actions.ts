'use server';

import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LOGIN_FAILED_MESSAGE, loginErrorMessage, parseLoginInput } from '@/lib/login-input';

export type LoginResult = { ok: true } | { ok: false; message: string };

function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Admin login as a Server Action — matches Supabase's recommended Next.js App Router pattern
 * (sign-in via the server client) instead of the previous browser-only `signInWithPassword` call
 * that had NO admin_users check at all at sign-in time.
 *
 * Both apps share one Supabase project's `auth.users` pool, so any valid email/password —
 * including a storefront customer's — authenticates here. Previously the only gate was
 * `requireAdmin()`, called later, per-request, inside individual `data/*.ts` functions; proxy.ts
 * also blocks page access, but neither of those signs the session back out. A non-admin could end
 * up holding a live, cookie-backed Supabase session indefinitely just by trying to log in here.
 * This closes that: the same `admin_users` lookup runs immediately after sign-in, in the same
 * server round-trip, and signs the session back out on the spot if it fails — mirroring the
 * storefront's `signInWithPassword` action for `customers`/`status`.
 */
export async function signIn(email: string, password: string): Promise<LoginResult> {
  // B3: the whole action wrapped in try/catch -- getServiceRoleClient() (and anything else here)
  // throws synchronously on a misconfigured env, which would otherwise take down every login
  // attempt with a raw exception instead of a clean message.
  try {
    return await signInChecks(email, password);
  } catch (err) {
    console.error('[login] unexpected error:', err);
    return { ok: false, message: 'Something went wrong — please try again.' };
  }
}

async function signInChecks(email: string, password: string): Promise<LoginResult> {
  // Reachable by a direct POST: refuse anything that is not two sane strings, with the same
  // message as a wrong password.
  const input = parseLoginInput(email, password);
  if (!input) return { ok: false, message: LOGIN_FAILED_MESSAGE };

  const supabase = await createSupabaseServerClient();

  const { error: signInError } = await supabase.auth.signInWithPassword(input);
  if (signInError) {
    // Never echo Supabase's text; only a throttling notice differs from "wrong email or password".
    return { ok: false, message: loginErrorMessage(signInError.code) };
  }

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) {
    await supabase.auth.signOut();
    return { ok: false, message: 'Something went wrong — please try again.' };
  }

  const service = getServiceRoleClient();
  const { data: adminRow, error: adminRowError } = await service
    .from('admin_users')
    .select('id')
    .eq('user_id', data.claims.sub as string)
    .maybeSingle();

  // B2: a transient DB/network failure on this query is NOT the same thing as "genuinely not an
  // admin" -- conflating the two would sign out and misleadingly tell a legitimate admin "wrong
  // password" during a service hiccup. Matches the pattern already established by
  // admin-auth.ts's requireAdmin() and proxy.ts, both of which distinguish "could not verify"
  // from "verified, not an admin". Session is intentionally left alone here (not signed out) --
  // it's a real, valid session, just unverified; the admin can simply retry.
  if (adminRowError) {
    return { ok: false, message: 'Could not verify admin access — please try again.' };
  }

  if (!adminRow) {
    await supabase.auth.signOut();
    // Same message as a wrong password: a specific "no admin access" would confirm to an attacker
    // that the email + password they tried are valid (e.g. a storefront customer's).
    return { ok: false, message: LOGIN_FAILED_MESSAGE };
  }

  return { ok: true };
}
