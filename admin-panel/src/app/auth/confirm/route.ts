import { type EmailOtpType } from '@supabase/supabase-js';

// The only link types Supabase issues that this route is meant to confirm.
const OTP_TYPES = ['invite', 'magiclink', 'recovery', 'signup', 'email', 'email_change'] as const;
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Official Supabase pattern (confirmed 2026-08-22, supabase.com/docs/guides/auth/passwords) —
 * NOT the same as this file's earlier two (wrong) attempts:
 *   1. exchangeCodeForSession(code) — that's for OAuth/PKCE `?code=` links, not this.
 *   2. Relying on the browser client auto-detecting a URL hash — Supabase's hosted
 *      /auth/v1/verify redirect (what generateLink()/inviteUserByEmail() produce by default)
 *      doesn't reliably hand off a session that way for this project.
 *
 * The correct pattern: generate the link ourselves with a `token_hash`, point it straight at this
 * route (bypassing Supabase's hosted /auth/v1/verify middleman entirely), and call verifyOtp()
 * here — server-side, writes the session as a cookie — before redirecting to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get('token_hash');
  const rawType = searchParams.get('type');
  const type = (OTP_TYPES as readonly string[]).includes(rawType ?? '') ? (rawType as EmailOtpType) : null;
  // `next` must stay ON this site: a relative path only. `new URL('https://evil.example', base)` would
  // otherwise happily redirect a freshly signed-in admin off-site (and `//evil.example` is
  // protocol-relative), so anything not starting with a single "/" falls back to the home page.
  const rawNext = searchParams.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('\\') ? rawNext : '/';

  if (token_hash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL('/login?error=invalid-link', request.url));
}
