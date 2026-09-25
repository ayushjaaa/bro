import { listCustomerCartsPage, listCartSnapshotForCustomers, listCartActivity } from '@/data/customers';
import { getProductTitlesByIds, getVariantDetailsByIds } from '@/data/products';
import CartOverview, { PAGE_SIZE } from '@/features/customers/components/CartOverview';

/**
 * Dedicated Cart page (split out of /customers -- see CustomersTable's doc comment) so an admin
 * has one place to see, per customer, exactly what's in their cart right now. Activity history
 * isn't shown as a standalone site-wide feed here -- it lives behind clicking into a specific
 * customer's row (see CartOverview's CustomerActivityModal), which is what an admin actually
 * wants ("what has THIS person been doing"), not a firehose of every customer's events mixed
 * together.
 *
 * "Current Carts by Customer" is paginated server-side (list_customer_carts, via
 * listCustomerCartsPage) -- see 012-cart-snapshot-pagination.sql for why that has to be a real
 * grouped/ordered Postgres query rather than a plain LIMIT/OFFSET. This only ever fetches page 1
 * for the initial render; page changes and searches are handled client-side by CartOverview
 * calling getCustomerCartsPageAction.
 */
export default async function CartPage() {
  // Activity doesn't depend on the page of customers, so it runs alongside the RPC instead of after it.
  const [firstPage, cartActivity] = await Promise.all([
    listCustomerCartsPage({ limit: PAGE_SIZE, offset: 0 }),
    listCartActivity(),
  ]);
  const items = await listCartSnapshotForCustomers(firstPage.customers.map((c) => c.customerId));

  // Resolve exactly the referenced products/variants (no listProductLines() -- that pulls 100
  // products x 250 variants + taxonomy metaobjects from Shopify just to read titles, and was the
  // slowest step on this page). Both lookups are independent, so they run in parallel; variant
  // details already carry the flavour, product title and price the cart list + totals need.
  const productIds = [
    ...new Set([
      ...items.map((r) => r.product_id),
      ...cartActivity.map((e) => e.productId).filter((id): id is string => id !== null),
    ]),
  ];
  const [productTitleById, variantDetailById] = await Promise.all([
    getProductTitlesByIds(productIds),
    getVariantDetailsByIds(items.map((i) => i.variant_id)),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Cart</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Live view of what every customer currently has in their cart. Click a customer to see their full activity.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-neutral-700 mb-2">Current Carts by Customer</h2>
        <CartOverview
          initialCustomers={firstPage.customers}
          initialTotalCount={firstPage.totalCount}
          initialTotalItems={firstPage.totalItems}
          initialItems={items}
          initialCartActivity={cartActivity}
          initialProductTitleById={productTitleById}
          initialVariantDetailById={variantDetailById}
        />
      </div>
    </div>
  );
}
