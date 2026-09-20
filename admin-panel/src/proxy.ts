import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * This entire app IS the admin panel (there is no "/admin" URL prefix — every route from "/" is
 * admin-only). Corrected 2026-08-22: an earlier version of this file only protected paths under
 * "/admin", which meant the real pages ("/", "/bulk-add", "/flavors/new") were never actually
 * gated — only a throwaway "/admin/test" verification page was. Fixed to protect everything by
 * default and explicitly allow-list the handful of public paths instead.
 *
 * Refreshes the Supabase session on every request (official Supabase SSR pattern) and does a
 * fast, UX-only redirect for visitors who are either not logged in, or logged in but not an admin
 * (e.g. a storefront customer — same Supabase project serves both auth flows per item 21, so "has
 * a valid session" alone does not mean "is an admin").
 *
 * NOT the sole security boundary — DECISIONS.md item 44a-i (CVE-2025-29927 precedent): every
 * admin Server Action/DAL function independently re-verifies via requireAdmin(), regardless of
 * what this proxy decides. This admin_users check exists in ADDITION to that DAL check, so a
 * future page/DAL function that forgets to call requireAdmin() still isn't silently exposed.
 */
// "/auth/confirm" must stay public: it's the verifyOtp() callback (official Supabase pattern,
// confirmed 2026-08-22) that establishes a session BEFORE one exists — blocking it would redirect
// to /login before verifyOtp() ever runs. "/set-password" stays public as a safety net in case
// the confirm step ever redirects here without a session having been set. "/api/webhooks/*" must
// also stay public: Shopify's webhook POSTs carry no session/cookies at all (server-to-server
// calls, not browser requests) — they'd otherwise be redirected to /login before the route
// handlers ever run. Their trust boundary is HMAC verification inside each route itself, not this
// admin_users check. "/api/internal/*" is the same story for storefront-to-admin-panel calls
// (e.g. checkout's create-draft-order): no admin session exists for those either, so they'd
// otherwise be silently redirected to /login (a 200 HTML page, not an error) instead of ever
// reaching the route handler. Their trust boundary is the X-Internal-Secret check inside each
// route itself.
const PUBLIC_PATHS = [
  '/login',
  '/auth/confirm',
  '/set-password',
  '/api/webhooks/orders',
  '/api/webhooks/inventory',
  '/api/webhooks/products',
];
const PUBLIC_PATH_PREFIXES = ['/api/internal/'];

// A path that doesn't correspond to any real page should render the app's not-found.tsx for
// EVERY visitor, logged in or not -- there's nothing sensitive on a 404 page, and redirecting
// unknown paths to /login was leaking "this path is/isn't a real protected route" as a side
// channel. Kept as an explicit allow-list (rather than trying to ask Next.js "does this path
// resolve?") so a typo'd URL 404s instead of silently landing on /login. If a new page is ever
// added here without updating this list, it's still not a security hole: (dashboard)/layout.tsx
// independently calls requireAdmin() and redirects to /login itself (DECISIONS.md item 44a-i).
const PROTECTED_EXACT_PATHS = [
  '/',
  '/products',
  '/products/attention',
  '/products/bulk-add',
  '/products/new',
  '/taxonomy',
  '/customers',
  '/cart',
];
const PROTECTED_DYNAMIC_PATTERNS = [
  /^\/products\/[^/]+$/,
  /^\/products\/[^/]+\/edit-flavours$/,
  /^\/products\/[^/]+\/variants$/,
];
function isKnownProtectedPath(pathname: string) {
  return (
    PROTECTED_EXACT_PATHS.includes(pathname) ||
    PROTECTED_DYNAMIC_PATTERNS.some((pattern) => pattern.test(pathname))
  );
}

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

  // getClaims() can hit the network (refreshing an expired access token, or verifying against
  // the Auth server), so it can fail transiently the same way the admin_users lookup below can.
  // "AuthSessionMissingError" means there's genuinely no session; anything else gets one retry
  // before being treated as a real "not logged in" — same fix as requireAdmin() in admin-auth.ts.
  let email: string | undefined;
  let claimsCheckFailed = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.auth.getClaims();
    if (!error && data?.claims?.email) {
      email = data.claims.email as string;
      claimsCheckFailed = false;
      break;
    }
    if (error?.name === 'AuthSessionMissingError') {
      break;
    }
    claimsCheckFailed = true;
  }

  const isPublicPath =
    PUBLIC_PATHS.includes(request.nextUrl.pathname) ||
    PUBLIC_PATH_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));

  if (!isPublicPath && isKnownProtectedPath(request.nextUrl.pathname)) {
    // A failed claims check (network/service hiccup) is not proof of "not logged in" — don't
    // redirect here. This is only a UX-layer check anyway (see file header): layout.tsx's own
    // requireAdmin() call is the real security boundary and will make the authoritative call.
    if (claimsCheckFailed) {
      return response;
    }

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

    // One retry for a transient failure (network blip, connection pool exhaustion, cold start)
    // before giving up — a query error is NOT the same thing as "no matching admin row", and must
    // never be treated as one. Conflating the two here previously caused valid sessions to be
    // bounced to /login whenever this lookup merely failed to run, not when it genuinely found no
    // admin row (auto-logout bug, fixed here).
    let adminRow: { id: string } | null = null;
    let lookupFailed = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await service
        .from('admin_users')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (!error) {
        adminRow = data;
        lookupFailed = false;
        break;
      }
      lookupFailed = true;
    }

    // If the lookup itself never succeeded, we genuinely don't know whether this user is an
    // admin — that's a service problem, not proof they're unauthorized, so don't redirect to
    // /login here. This is only a UX-layer check anyway (see file header): layout.tsx's own
    // requireAdmin() call is the real security boundary and will make the authoritative call.
    if (lookupFailed) {
      return response;
    }

    if (!adminRow) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
