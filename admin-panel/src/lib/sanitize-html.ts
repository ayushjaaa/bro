import sanitizeHtml from 'sanitize-html';

/**
 * Product descriptions come from Shopify as raw HTML that anyone with product-edit access (staff,
 * apps, importers) can write, and the admin panel is the highest-privilege app we have -- so it must
 * never render that HTML as-is. Allow-list sanitiser (OWASP XSS Prevention: sanitise untrusted HTML
 * with an allow-list, at output time, with a maintained library, and don't touch the string after).
 * `sanitize-html` rather than DOMPurify because it needs no DOM/jsdom, so it runs cleanly in a
 * Next.js Server Component.
 *
 * Kept: ordinary rich text -- paragraphs, headings, bold/italic/underline, lists, links, images,
 * tables, quotes. Dropped: scripts, styles, iframes/objects/forms, every `on*` handler, inline
 * `style`, `class`, and any URL that isn't http(s) (links may also be mailto:, images https only).
 * Links always get rel="noopener noreferrer".
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }),
  },
};

export function sanitizeProductHtml(html: string | null | undefined): string {
  if (!html) return '';
  return sanitizeHtml(html, OPTIONS);
}
