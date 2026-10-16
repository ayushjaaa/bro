/** Rows per page for the Customers screen's main table. Deliberately its OWN plain module, no
 * 'use client'/'use server'/'server-only' directive at all -- it's just a number, safe to import
 * from both the Server Component (customers/page.tsx, for the SSR first page) and the Client
 * Component (CustomersTable.tsx, for client-side pagination) without crossing either of the two
 * boundary issues found live in this session:
 *   1. A 'use client' module's exports (even a plain constant) get rewritten into opaque
 *      client-reference objects by Next's RSC bundler when imported from a Server Component --
 *      confirmed live: importing it from CustomersTable.tsx resolved to a function reference
 *      instead of `20` in page.tsx, silently breaking `.range()` into NaN and returning zero rows.
 *   2. A `server-only`-guarded module (data/customers.ts) cannot be imported from a Client
 *      Component at all -- confirmed live: moving the constant there broke the build entirely
 *      ("'server-only' cannot be imported from a Client Component module").
 * A bare, directive-free module sidesteps both. */
export const CUSTOMERS_PAGE_SIZE = 20;
