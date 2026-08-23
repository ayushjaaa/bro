'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Where the recovery/invite email's link lands directly (no intermediate server redirect — a
 * redirect's Location header would drop the URL hash the session token arrives in, per the
 * official Supabase pattern: admin-generated links use the hash-based implicit flow, not PKCE).
 *
 * Official pattern (confirmed 2026-08-22, Supabase docs): don't assume a session exists as soon
 * as the page loads — listen for the PASSWORD_RECOVERY event via onAuthStateChange, which fires
 * once the browser client has parsed the hash and established the session.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const supabaseRef = useRef(createSupabaseBrowserClient());
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = supabaseRef.current;

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const { error } = await supabaseRef.current.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  if (!ready) {
    return (
      <div className="max-w-sm mx-auto mt-24 p-6 rounded-lg border border-neutral-200 bg-white">
        <p className="text-sm text-neutral-500">Verifying your link...</p>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-24 p-6 rounded-lg border border-neutral-200 bg-white flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Set your password</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-neutral-700">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-neutral-700">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Set password'}
        </button>
      </form>
    </div>
  );
}
