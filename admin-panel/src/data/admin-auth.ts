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
 * DECISIONS.md item 44a-i — the real admin-authorization check. Every data/*.ts function must
 * call this first, before touching Shopify or returning any data.
 *
 * 1. Verifies the caller's session JWT (getClaims() — actually validates, unlike getSession()).
 * 2. Looks up the verified email in admin_users via the Service Role client (bypasses RLS) —
 *    never trusts user metadata or a JWT claim the user could have set themselves.
 *
 * Throws if either check fails — callers should let this propagate (Server Action returns an
 * error to the client) rather than swallow it.
 */
export async function requireAdmin(): Promise<{ email: string; id: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.email) {
    throw new Error('Unauthorized — not logged in');
  }

  const email = data.claims.email as string;
  const service = getServiceRoleClient();

  const { data: adminRow } = await service
    .from('admin_users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (!adminRow) {
    throw new Error('Forbidden — not an admin');
  }

  return { email, id: data.claims.sub as string };
}

/** DAL — the actual sign-out call. Server Actions call this, never Supabase directly. */
export async function signOutAdmin() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}
