import type { ReactNode } from 'react';

/**
 * Shared card chrome for every Dashboard widget -- extracted from the identical
 * `rounded-xl border border-dash-card-border bg-dash-card-bg` className repeated across
 * page.tsx and the dashboard components. Purely presentational: no data, no logic.
 */
export function DashCard({
  children,
  className = '',
  overflowHidden = false,
}: {
  children: ReactNode;
  className?: string;
  overflowHidden?: boolean;
}) {
  return (
    <div
      className={`relative z-10 rounded-3xl border border-dash-card-border bg-dash-card-bg shadow-(--dash-card-shadow) ${overflowHidden ? 'overflow-hidden' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Shared card-header row -- the `px-4 py-3 border-b flex items-center justify-between`
 * pattern that was copy-pasted near-identically across ~5 list cards. `count` renders a
 * small muted badge next to the title; `action` renders a right-aligned link/button
 * (e.g. "View all ->").
 */
export function DashCardHeader({
  title,
  count,
  action,
}: {
  title: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-dash-divider px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-bold text-dash-text-ink">{title}</h2>
        {typeof count === 'number' && (
          <span className="rounded-full bg-dash-pill-neutral-bg px-1.5 py-0.5 text-[10.5px] font-medium text-dash-pill-neutral-text">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}
