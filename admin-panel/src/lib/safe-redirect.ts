/**
 * Post-login redirect targets must stay ON this site. `new URL('https://evil.example', base)` (or a
 * protocol-relative `//evil.example`) would otherwise send a freshly signed-in admin to another site.
 * Only a plain relative path is accepted; anything else falls back. Pure -- unit-tested.
 *
 * Also rejects backslashes and any control character / whitespace: browsers strip tabs and newlines
 * from URLs, so `/\t/evil.example` would silently become `//evil.example`.
 */
export function safeRelativePath(raw: string | null | undefined, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (raw.includes('\\') || /[\u0000- \u007f]/.test(raw)) return fallback;
  return raw;
}
