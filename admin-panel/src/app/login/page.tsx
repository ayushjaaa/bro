'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  async function signInWithGoogle() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="max-w-sm mx-auto mt-24 p-6 rounded-lg border border-neutral-200 bg-white flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Admin Login</h1>
      <button
        onClick={signInWithGoogle}
        className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700"
      >
        Sign in with Google
      </button>
    </div>
  );
}
