import Image from 'next/image';

/**
 * Full-screen transition shown for a beat after a successful sign-in, before the dashboard
 * route swaps in -- the "big-name product" polish of a real loading moment (logo settle +
 * indeterminate progress bar) instead of an instant, jarring cut from the login card straight
 * to the dashboard. LoginPage keeps this mounted for a short fixed delay (see its handleSubmit)
 * so the animation actually gets time to play before router.push takes over.
 */
export function LoginSuccessOverlay() {
  return (
    <div
      className="animate-login-overlay-in fixed inset-0 z-50 flex flex-col items-center justify-center gap-6"
      style={{
        background:
          'radial-gradient(120% 120% at 15% 0%, var(--brand-purple-bright) 0%, var(--brand-purple-accent) 30%, #2c1547 65%, #17102a 100%)',
      }}
    >
      <div className="relative flex items-center justify-center">
        <span className="animate-login-glow-pulse absolute size-28 rounded-full bg-white/30 blur-2xl" aria-hidden="true" />
        <span className="animate-login-logo-in relative flex items-center justify-center rounded-2xl bg-white px-6 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
          <Image src="/logoGemin.svg" alt="Gemini Distribution" width={224} height={45} className="h-9 w-auto" priority />
        </span>
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="animate-login-text-in text-sm font-medium text-white/90">Preparing your dashboard...</p>
        <div className="h-1 w-48 overflow-hidden rounded-full bg-white/15">
          <div className="animate-login-progress-bar h-full w-1/3 rounded-full bg-white" />
        </div>
      </div>

      <style>{`
        @keyframes login-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes login-logo-in {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes login-text-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes login-glow-pulse {
          0%, 100% { opacity: 0.35; transform: scale(0.9); }
          50% { opacity: 0.6; transform: scale(1.15); }
        }
        @keyframes login-progress-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        .animate-login-overlay-in { animation: login-overlay-in 0.25s ease-out both; }
        .animate-login-logo-in { animation: login-logo-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .animate-login-text-in { animation: login-text-in 0.4s ease-out 0.15s both; }
        .animate-login-glow-pulse { animation: login-glow-pulse 1.6s ease-in-out infinite; }
        .animate-login-progress-bar { animation: login-progress-bar 1s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
