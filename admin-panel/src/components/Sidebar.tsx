'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 4 sections, per the UX pass in ADMIN_PANEL_IMPLEMENTATION.md §4 — Chunking (4±1 ideal group
 * size) and Mental Model/Mimicry ("Products" matches Shopify's own admin wording exactly, so the
 * non-technical admin this panel is built for doesn't have to relearn vocabulary).
 */
const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/products', label: 'Products' },
  { href: '/taxonomy', label: 'Taxonomy' },
  { href: '/customers', label: 'Customers' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-50/60 h-full py-4">
      <nav className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-emerald-600 text-white'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
