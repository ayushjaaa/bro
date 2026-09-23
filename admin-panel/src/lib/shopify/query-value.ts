/**
 * Escapes a value for Shopify's search-query syntax (`customers(query: "email:'...'")`), wrapped in
 * single quotes so it is always ONE literal term. Without it a value such as `a@x.com OR email:*`
 * would be read as search operators instead of text. Same rules as the storefront's
 * `quoteSearchValue`: `\`, `'`, `:`, `(`, `)` are backslash-escaped, and a leading `-` or `"` is
 * neutralised. Ordinary emails (`a.b+tag@x.com`) come out unchanged apart from the quotes. Pure.
 */
export function quoteShopifySearchValue(value: string): string {
  let escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
  if (/^[-"]/.test(escaped)) escaped = `\\${escaped}`;
  return `'${escaped}'`;
}
