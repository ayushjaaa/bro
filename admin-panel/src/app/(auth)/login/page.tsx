'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { signIn } from './actions';
import { LoginSuccessOverlay } from './LoginSuccessOverlay';

// How long the success overlay stays on screen before the actual navigation fires -- long enough
// for its logo/progress animation to read as an intentional moment, short enough not to feel like
// an artificial delay tacked onto the real sign-in request.
const SUCCESS_OVERLAY_MS = 900;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn(email, password);

    if (!result.ok) {
      setLoading(false);
      setError(result.message);
      return;
    }

    setRedirecting(true);
    // Read by DashboardShellAnimator once, right after this navigation lands -- makes the
    // sidebar/topbar/content entrance animation play only for this first load, not on every
    // later in-app page visit.
    window.sessionStorage.setItem('gd-admin-just-logged-in', '1');
    setTimeout(() => {
      router.push('/');
      router.refresh();
    }, SUCCESS_OVERLAY_MS);
  }

  if (redirecting) return <LoginSuccessOverlay />;

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{
        background:
          'radial-gradient(120% 120% at 15% 0%, var(--brand-purple-bright) 0%, var(--brand-purple-accent) 30%, #2c1547 65%, #17102a 100%)',
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/95 p-8 shadow-[0_24px_60px_rgba(20,8,40,0.45)] backdrop-blur-xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image src="/logoGemin.svg" alt="Gemini Distribution" width={224} height={45} className="h-8 w-auto" priority />
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">Admin Panel</h1>
            <p className="mt-0.5 text-[13px] text-neutral-500">Sign in to manage the Gemini Distribution storefront</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-neutral-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-purple-deep focus:ring-4 focus:ring-(--brand-purple-deep)/10 disabled:bg-neutral-50 disabled:text-neutral-400"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-neutral-700">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 pr-10 text-sm outline-none transition-colors focus:border-brand-purple-deep focus:ring-4 focus:ring-(--brand-purple-deep)/10 disabled:bg-neutral-50 disabled:text-neutral-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                disabled={loading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-500 hover:text-neutral-700 disabled:opacity-40"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.9 18.9 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.9 18.9 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(107,58,172,0.35)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            style={{
              background: 'linear-gradient(135deg, var(--brand-purple-bright) 0%, var(--brand-purple-deep) 100%)',
            }}
          >
            {loading && (
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
