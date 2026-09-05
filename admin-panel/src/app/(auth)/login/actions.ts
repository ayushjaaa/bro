'use server';

import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  const supabase = await createSupabaseServerClient();

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return { ok: false, message: signInError.message };
  }

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.email) {
    await supabase.auth.signOut();
    return { ok: false, message: 'Something went wrong — please try again.' };
  }

  const service = getServiceRoleClient();
  const { data: adminRow } = await service
    .from('admin_users')
    .select('id')
    .eq('email', data.claims.email as string)
    .maybeSingle();

  if (!adminRow) {
    await supabase.auth.signOut();
    return { ok: false, message: 'This account does not have admin access.' };
  }

  return { ok: true };
}
