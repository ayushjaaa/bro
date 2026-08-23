import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase session on every request (official Supabase SSR pattern) and does a
 * fast, UX-only redirect for visitors to /admin routes who are either not logged in, or logged
 * in but not an admin (e.g. a storefront customer — same Supabase project serves both auth flows
 * per item 21, so "has a valid session" alone does not mean "is an admin").
 *
 * NOT the sole security boundary — DECISIONS.md item 44a-i (CVE-2025-29927 precedent): every
 * admin Server Action/DAL function independently re-verifies via requireAdmin(), regardless of
 * what this proxy decides. This admin_users check exists in ADDITION to that DAL check, so a
 * future page/DAL function that forgets to call requireAdmin() still isn't silently exposed.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data } = await supabase.auth.getClaims();

  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin');
  const isLoginPage = request.nextUrl.pathname === '/login';

  if (isAdminRoute && !isLoginPage) {
    const email = data?.claims?.email as string | undefined;

    if (!email) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Authorization check (separate from the authentication already proven by having a valid
    // session at all, per DECISIONS.md item 44a's clarification) — bypasses RLS intentionally,
    // same service-role pattern as requireAdmin().
    const service = createServiceRoleClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: adminRow } = await service
      .from('admin_users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!adminRow) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
