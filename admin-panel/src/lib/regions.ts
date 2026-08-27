/** Canada's excise-stamp regions (§0 fact 2) -- fixed, 6-value list, shared by both the
 * server-only variants DAL (data/variants.ts) and client components (VariantBulkTable.tsx). No
 * `server-only` guard here deliberately, unlike data/variants.ts -- this file must be importable
 * from the browser bundle. */
export const REGIONS = [
  { value: 'federal', label: 'Federal' },
  { value: 'bc', label: 'British Columbia' },
  { value: 'alberta', label: 'Alberta' },
  { value: 'manitoba', label: 'Manitoba' },
  { value: 'ontario', label: 'Ontario' },
  { value: 'quebec', label: 'Quebec' },
] as const;
