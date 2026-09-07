import { listCustomerCartsPage, listCartSnapshotForCustomers, listCartActivity } from '@/data/customers';
import { listProductLines, getProductTitlesByIds } from '@/data/products';
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
  const firstPage = await listCustomerCartsPage({ limit: PAGE_SIZE, offset: 0 });
  const [items, cartActivity, productLines] = await Promise.all([
    listCartSnapshotForCustomers(firstPage.customers.map((c) => c.customerId)),
    listCartActivity(),
    listProductLines(),
  ]);

  const productTitleById = new Map(productLines.map((p) => [p.id, p.title]));

  // cart_snapshot/cart_events can reference products outside listProductLines()'s newest-100
  // window (deleted, unpublished, or just old) -- resolve those specific ids directly rather than
  // showing their bare Shopify numeric id in the UI.
  const referencedProductIds = new Set([
    ...items.map((r) => r.product_id),
    ...cartActivity.map((e) => e.productId).filter((id): id is string => id !== null),
  ]);
  const missingProductIds = [...referencedProductIds].filter((id) => !productTitleById.has(id));
  if (missingProductIds.length > 0) {
    const resolved = await getProductTitlesByIds(missingProductIds);
    for (const [id, title] of resolved) productTitleById.set(id, title);
  }

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
        />
      </div>
    </div>
  );
}
