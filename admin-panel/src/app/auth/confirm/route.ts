import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * PKCE callback (confirmed 2026-08-22, official Supabase docs) — this project's auth flow sends
 * a `?code=` query param, not a URL hash. A hash never reaches the server, but a query param
 * does, so this Route Handler exchanges it server-side and writes the session as a cookie before
 * forwarding to /set-password. Without this step, /set-password sees no session at all
 * ("Auth session missing!") because the code was never exchanged.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL('/set-password', request.url));
}
