'use client';

import { useEffect, useState } from 'react';

/** Set by the login page right before it navigates into the dashboard -- see login/page.tsx. */
const JUST_LOGGED_IN_KEY = 'gd-admin-just-logged-in';

/**
 * Wraps the (dashboard) layout's shell (TopBar/Sidebar/main) so the entrance animation defined
 * in globals.css plays exactly once, right after a fresh login -- not on every internal Link
 * navigation between dashboard pages. This component's own mount only happens when the whole
 * layout mounts (once per login session, since Next keeps this layout instance alive across
 * client-side navigation between dashboard routes), so the flag only needs to be read once here.
 *
 * The state initializer only READS the flag (no side effect) -- React Strict Mode (on by default
 * under `next dev`) invokes useState lazy initializers twice and discards the first result, so an
 * initializer that also *clears* the flag would wipe it on the throwaway first call, leaving the
 * real second call to find it already gone and always resolve to false. Clearing happens
 * separately in the effect below, where a double-invoke is harmless (removing an already-removed
 * key is a no-op).
 */
export function DashboardShellAnimator({ children }: { children: React.ReactNode }) {
  const [shouldAnimate] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(JUST_LOGGED_IN_KEY) === '1';
  });

  useEffect(() => {
    if (shouldAnimate) window.sessionStorage.removeItem(JUST_LOGGED_IN_KEY);
  }, [shouldAnimate]);

  return (
    <div className="min-h-full h-full flex flex-col bg-neutral-50 text-neutral-900" data-shell-animate={shouldAnimate || undefined}>
      {children}
    </div>
  );
}
