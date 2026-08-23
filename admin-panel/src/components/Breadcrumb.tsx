'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Generic path-segment breadcrumb (Wayfinding principle — "where am I" for nested routes like
 * /products/[id]/variants). Derives labels from the URL by default; pass `labels` to override
 * a segment's display text (e.g. a Product Line's real name instead of its id).
 */
export default function Breadcrumb({ labels }: { labels?: Record<string, string> }) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  let href = '';
  return (
    <nav className="flex items-center gap-1.5 text-sm text-neutral-500">
      <Link href="/" className="hover:text-neutral-800">
        Dashboard
      </Link>
      {segments.map((segment, i) => {
        href += `/${segment}`;
        const isLast = i === segments.length - 1;
        const label = labels?.[segment] ?? segment.replace(/-/g, ' ');
        return (
          <span key={href} className="flex items-center gap-1.5">
            <span className="text-neutral-300">/</span>
            {isLast ? (
              <span className="text-neutral-800 font-medium capitalize">{label}</span>
            ) : (
              <Link href={href} className="hover:text-neutral-800 capitalize">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
