/** Rows per page for /products -- shared by the server component (products/page.tsx) and the
 * client table (ProductsTable.tsx). Lives outside both so the server component never has to
 * import a value from a 'use client' module (that resolves to a client reference on the server,
 * not the plain number, and broke the /products page's Shopify pagination query). */
export const PRODUCTS_PAGE_SIZE = 25;
