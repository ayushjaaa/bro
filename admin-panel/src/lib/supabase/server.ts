import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client for Server Components/Actions/Route Handlers — reads the caller's session from
 * cookies. Use this to find out WHO is calling (via getClaims()), not for admin-only operations
 * (see admin-auth.ts's service-role client for that, which bypasses RLS).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component (not an Action/Route Handler) — cookies can't be
            // written here. Harmless as long as proxy.ts is also refreshing the session.
          }
        },
      },
    }
  );
}
