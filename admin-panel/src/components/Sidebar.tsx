'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, BoxIcon, WarningIcon, LayersIcon, UsersIcon, UserIcon, CartIcon } from './icons';

/**
 * 4 sections, per the UX pass in ADMIN_PANEL_IMPLEMENTATION.md §4 — Chunking (4±1 ideal group
 * size) and Mental Model/Mimicry ("Products" matches Shopify's own admin wording exactly, so the
 * non-technical admin this panel is built for doesn't have to relearn vocabulary). Each item
 * gets a small icon (Recognition Over Recall / Iconic Representation) so the nav is scannable
 * at a glance, not just a column of text.
 */
const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: HomeIcon },
  { href: '/products', label: 'Products', icon: BoxIcon },
  // Same flat top-level treatment as every other item, not indented -- the Dashboard's stat
  // tiles already link here ("View all ->" on Out of Stock/Low Stock), but there was no way to
  // reach it from the nav itself. Exact-match active state (see isActive below) so opening
  // this doesn't also light up "Products".
  { href: '/products/attention', label: 'Attention', icon: WarningIcon },
  { href: '/taxonomy', label: 'Taxonomy', icon: LayersIcon },
  { href: '/customers', label: 'Customers', icon: UsersIcon },
  { href: '/sales-reps', label: 'Sales Reps', icon: UserIcon },
  { href: '/cart', label: 'Cart', icon: CartIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  // If the path exactly matches one nav item (e.g. "/products/attention"), that item alone is
  // active -- a sibling item whose href happens to be a prefix ("/products") doesn't also
  // light up just because it's a string-prefix match.
  const exactMatch = NAV_ITEMS.some((i) => i.href === pathname);

  return (
    <aside className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-50/60 h-full py-4">
      <nav className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || (!exactMatch && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-brand-purple-deep text-white'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <Icon className={`size-4 shrink-0 ${isActive ? 'text-white' : 'text-neutral-400'}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
