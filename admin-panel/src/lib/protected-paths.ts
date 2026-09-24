/**
 * Which URLs are real, login-only admin pages. Lives here (not inside proxy.ts) so a unit test can
 * check it against the pages that actually exist on disk -- see tests/unit/protected-paths.test.ts.
 * Adding a page under src/app/(dashboard) without listing it here fails that test.
 *
 * A path that doesn't correspond to any real page should render the app's not-found.tsx for EVERY
 * visitor, logged in or not -- there's nothing sensitive on a 404 page, and redirecting unknown
 * paths to /login was leaking "this path is/isn't a real protected route" as a side channel. Kept
 * as an explicit allow-list (rather than trying to ask Next.js "does this path resolve?") so a
 * typo'd URL 404s instead of silently landing on /login. If a page is ever missing from this list
 * it's still not a security hole: (dashboard)/layout.tsx independently calls requireAdmin() and
 * redirects to /login itself (DECISIONS.md item 44a-i) -- this list just makes the redirect happen
 * earlier, before the page renders.
 */
export const PROTECTED_EXACT_PATHS = [
  '/',
  '/products',
  '/products/attention',
  '/products/new',
  '/taxonomy',
  '/customers',
  '/cart',
  '/activity',
  '/sales-reps',
];

export const PROTECTED_DYNAMIC_PATTERNS = [
  /^\/products\/[^/]+$/,
  /^\/products\/[^/]+\/edit-flavours$/,
  /^\/products\/[^/]+\/variants$/,
];

export function isKnownProtectedPath(pathname: string): boolean {
  return (
    PROTECTED_EXACT_PATHS.includes(pathname) ||
    PROTECTED_DYNAMIC_PATTERNS.some((pattern) => pattern.test(pathname))
  );
}
