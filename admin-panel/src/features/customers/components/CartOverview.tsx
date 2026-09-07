'use client';

import { useEffect, useRef, useState } from 'react';
import type { CartSnapshotRow, CartEvent, CustomerCartSummary } from '@/data/customers';
import { getCustomerCartsPageAction } from '../actions';
import { useLiveTable } from '@/features/dashboard/hooks/useLiveTable';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type CartEventRow = {
  id: string;
  customer_id: string | null;
  product_id: string | null;
  action: string;
  quantity: number | null;
  event_at: string;
};

/** Rows per page for "Current Carts by Customer" -- kept in sync with the server: the initial
 * server-rendered page (cart/page.tsx) and every subsequent client-fetched page both use this
 * same size, so the page-count math here always lines up with what Postgres actually paged. */
export const PAGE_SIZE = 10;

/** How long to wait after the admin stops typing before searching, and after a live cart_snapshot
 * change before refetching the current page -- both exist to avoid re-running the paginated
 * Supabase query on every keystroke / every rapid-fire cart edit. */
const SEARCH_DEBOUNCE_MS = 300;
const LIVE_REFRESH_DEBOUNCE_MS = 500;

function toEventRow(e: CartEvent): CartEventRow {
  return {
    id: e.id,
    customer_id: e.customerId,
    product_id: e.productId,
    action: e.action,
    quantity: e.quantity,
    event_at: e.eventAt,
  };
}

/** Product cell shows both the human-readable title AND the raw Shopify product id -- the id
 * alone isn't identifiable at a glance, but an admin cross-referencing against Shopify admin
 * still needs it, so this doesn't hide one in favor of the other. */
function ProductLabel({ productId, productTitleById }: { productId: string; productTitleById: Map<string, string> }) {
  const numericId = productId.split('/').pop();
  const title = productTitleById.get(productId);
  return (
    <span>
      {title ?? `Product ${numericId}`}
      <span className="text-neutral-400"> · #{numericId}</span>
    </span>
  );
}

/**
 * Per-customer "what's in their cart right now" -- lives on its own page (/cart) rather than
 * nested in the Customers review table, so an admin has one dedicated place to see live cart
 * activity across every wholesale account without it getting lost inside the approval workflow.
 *
 * Grouped by `customer_id` (this app's own Supabase `customers.id`), NOT `shopifyCustomerId` --
 * `cart_snapshot.customer_id` is written by the storefront's `reportCartActivity()` using the
 * logged-in customer's app id (see `lib/auth/access-state.ts`'s `access.customer.id`), which is a
 * different id space than the Shopify Customer GID that order webhooks log against.
 *
 * Paginated server-side via `getCustomerCartsPageAction` -> `list_customer_carts`
 * (012-cart-snapshot-pagination.sql), NOT by fetching every cart_snapshot row and slicing in the
 * browser -- see that migration's comment for why a real grouped/ordered Postgres query was
 * needed rather than a plain LIMIT/OFFSET. Because pagination is now server-driven, this can't
 * just merge Supabase Realtime events into local state the way the rest of this admin panel's
 * live tables do (that would blur page boundaries and the "most recent first" order); instead any
 * cart_snapshot change anywhere triggers a debounced refetch of whatever page/search is currently
 * showing, which keeps the visible page fresh without breaking pagination.
 */
export default function CartOverview({
  initialCustomers,
  initialTotalCount,
  initialTotalItems,
  initialItems,
  initialCartActivity,
  initialProductTitleById,
}: {
  initialCustomers: CustomerCartSummary[];
  initialTotalCount: number;
  initialTotalItems: number;
  initialItems: CartSnapshotRow[];
  initialCartActivity: CartEvent[];
  initialProductTitleById: Map<string, string>;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState(initialCustomers);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [totalItems, setTotalItems] = useState(initialTotalItems);
  const [items, setItems] = useState(initialItems);
  const [productTitleById, setProductTitleById] = useState(initialProductTitleById);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const cartActivity = useLiveTable('cart_events', 'id', initialCartActivity.map(toEventRow));

  // Refs so the debounced search/live-refresh callbacks (set up once) always see the latest
  // values without needing to be torn down and rebuilt on every state change.
  const productTitleByIdRef = useRef(productTitleById);
  useEffect(() => {
    productTitleByIdRef.current = productTitleById;
  }, [productTitleById]);

  async function fetchPage(nextPage: number, nextQuery: string) {
    setIsLoading(true);
    try {
      const result = await getCustomerCartsPageAction({
        search: nextQuery,
        page: nextPage,
        pageSize: PAGE_SIZE,
        knownProductTitles: [...productTitleByIdRef.current.entries()],
      });
      setCustomers(result.customers);
      setTotalCount(result.totalCount);
      setTotalItems(result.totalItems);
      setItems(result.items);
      if (result.productTitles.length > 0) {
        setProductTitleById((prev) => {
          const next = new Map(prev);
          for (const [id, title] of result.productTitles) next.set(id, title);
          return next;
        });
      }
    } finally {
      setIsLoading(false);
    }
  }

  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  });

  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleQueryChange(value: string) {
    setQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      fetchPageRef.current(1, value);
    }, SEARCH_DEBOUNCE_MS);
  }

  function goToPage(next: number) {
    setPage(next);
    fetchPageRef.current(next, query);
  }

  // Any cart_snapshot change anywhere refetches the current page/search -- keeps what's on screen
  // live without trying to merge raw Realtime rows into a server-paginated, grouped-by-customer
  // view (see this component's doc comment for why that would break page boundaries/ordering).
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    async function setup() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel(`cart_snapshot-live-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_snapshot' }, () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            fetchPageRef.current(pageRef.current, queryRef.current);
          }, LIVE_REFRESH_DEBOUNCE_MS);
        })
        .subscribe();
    }
    setup();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedCustomerId(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedCustomerId]);

  const byCustomer = new Map<string, CartSnapshotRow[]>();
  for (const row of items) {
    const list = byCustomer.get(row.customer_id) ?? [];
    list.push(row);
    byCustomer.set(row.customer_id, list);
  }

  const customerById = new Map(customers.map((c) => [c.customerId, c]));

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const selectedCustomer = selectedCustomerId ? customerById.get(selectedCustomerId) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          {totalCount} customer{totalCount === 1 ? '' : 's'} with items in cart · {totalItems} item
          {totalItems === 1 ? '' : 's'} total
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search by customer or email"
          className="w-72 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {customers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {totalCount === 0 && query.trim() === '' ? 'No customer carts have items yet.' : `No carts match "${query}".`}
        </div>
      ) : (
        <div
          className={`rounded-lg border border-neutral-200 bg-white divide-y divide-neutral-100 transition-opacity ${isLoading ? 'opacity-60' : ''}`}
        >
          {customers.map((customer) => {
            const customerItems = [...(byCustomer.get(customer.customerId) ?? [])].sort((a, b) =>
              b.updated_at.localeCompare(a.updated_at)
            );
            return (
              <button
                type="button"
                key={customer.customerId}
                onClick={() => setSelectedCustomerId(customer.customerId)}
                className="w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-neutral-800">
                      {customer.firstName} {customer.lastName}
                    </span>
                    {customer.businessName && (
                      <span className="text-neutral-400 text-xs ml-2">{customer.businessName}</span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400">
                    {customer.itemCount} item{customer.itemCount === 1 ? '' : 's'} · updated{' '}
                    {new Date(customer.lastUpdated).toLocaleString('en-CA')}
                  </span>
                </div>
                <ul className="mt-2 text-xs flex flex-col gap-1">
                  {customerItems.map((item) => (
                    <li key={item.variant_id} className="flex items-center justify-between text-neutral-700">
                      <ProductLabel productId={item.product_id} productTitleById={productTitleById} />
                      <span className="text-neutral-400 shrink-0 ml-2">
                        ×{item.quantity} · {new Date(item.updated_at).toLocaleString('en-CA')}
                      </span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      )}

      {totalCount > 0 && pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-neutral-500">
            Page {page} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(Math.max(1, page - 1))}
              disabled={page <= 1 || isLoading}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => goToPage(Math.min(pageCount, page + 1))}
              disabled={page >= pageCount || isLoading}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <CustomerActivityModal
          customer={selectedCustomer}
          cartItems={(byCustomer.get(selectedCustomer.customerId) ?? []).sort((a, b) =>
            b.updated_at.localeCompare(a.updated_at)
          )}
          activity={[...cartActivity.values()]
            .filter((e) => e.customer_id === selectedCustomer.customerId)
            .sort((a, b) => b.event_at.localeCompare(a.event_at))}
          productTitleById={productTitleById}
          onClose={() => setSelectedCustomerId(null)}
        />
      )}
    </div>
  );
}

/** Full activity for one customer -- opened by clicking their row in "Current Carts by Customer"
 * so an admin can drill from "who has stuff in their cart right now" into "everything this
 * specific customer has ever added, updated, or removed", without that history cluttering the
 * per-customer summary row above. */
function CustomerActivityModal({
  customer,
  cartItems,
  activity,
  productTitleById,
  onClose,
}: {
  customer: CustomerCartSummary;
  cartItems: CartSnapshotRow[];
  activity: CartEventRow[];
  productTitleById: Map<string, string>;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between border-b border-neutral-200 bg-white px-5 py-4">
          <div>
            <h3 className="font-semibold text-neutral-800">
              {customer.firstName} {customer.lastName}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {customer.businessName ? `${customer.businessName} · ` : ''}
              {customer.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-700 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4">
          <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-1.5">
            Current Cart {cartItems.length > 0 && `(${cartItems.length})`}
          </h4>
          {cartItems.length === 0 ? (
            <p className="text-xs text-neutral-400">Cart is empty.</p>
          ) : (
            <ul className="text-xs flex flex-col gap-1 mb-4">
              {cartItems.map((item) => (
                <li key={item.variant_id} className="flex items-center justify-between text-neutral-700">
                  <ProductLabel productId={item.product_id} productTitleById={productTitleById} />
                  <span className="text-neutral-400 shrink-0 ml-2">
                    ×{item.quantity} · {new Date(item.updated_at).toLocaleString('en-CA')}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-1.5 mt-4">
            Activity {activity.length > 0 && `(${activity.length})`}
          </h4>
          {activity.length === 0 ? (
            <p className="text-xs text-neutral-400">No cart activity reported yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {activity.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between text-xs border-b border-neutral-50 last:border-0 py-1.5"
                >
                  <div>
                    <span className="font-medium text-neutral-700 capitalize">{e.action.replace(/_/g, ' ')}</span>
                    {e.product_id && (
                      <span className="text-neutral-500 ml-2">
                        <ProductLabel productId={e.product_id} productTitleById={productTitleById} />
                      </span>
                    )}
                    {e.quantity != null && <span className="text-neutral-400 ml-2">×{e.quantity}</span>}
                  </div>
                  <span className="text-neutral-400 shrink-0 ml-2">
                    {new Date(e.event_at).toLocaleString('en-CA')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
