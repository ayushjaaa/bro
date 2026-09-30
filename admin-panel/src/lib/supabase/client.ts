'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClientOptions } from '@supabase/supabase-js';

/** Supabase client for Client Components — used by the login page's "Sign in with Google" button,
 * and by useLiveTable (which passes `realtime` options for its silent-disconnect handling). */
export function createSupabaseBrowserClient(options?: SupabaseClientOptions<'public'>) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    options
  );
}
