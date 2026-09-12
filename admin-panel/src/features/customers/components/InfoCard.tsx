import type { ReactNode } from 'react';

/** Shared grouped-section card for the Customer drawer -- every section (Contact, Business
 * Info, Sales Rep, Internal Notes, Orders, ...) uses this same bordered/titled unit so they
 * read as equally-weighted, clearly bounded groups instead of bleeding into one continuous
 * column like the old inline row-expand did. Plain neutral palette (not the Dashboard's
 * warm `--dash-*` theme, which is scoped to that page's own mockup). */
export function InfoCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
