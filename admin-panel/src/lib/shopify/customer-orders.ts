import 'server-only';
import { shopifyAdminRequest, shopifyAdminRequestAllowingPiiGaps } from './admin-client';

const LIST_DRAFT_ORDERS_BY_CUSTOMER_QUERY = /* GraphQL */ `
  query ListDraftOrdersByCustomer($query: String!) {
    draftOrders(first: 50, query: $query, sortKey: ID, reverse: true) {
      nodes {
        id
        name
        status
        createdAt
        totalQuantityOfLineItems
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

export type DraftOrderStatus = 'OPEN' | 'INVOICE_SENT' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

export interface CustomerOrderSummary {
  id: string;
  name: string;
  status: DraftOrderStatus;
  createdAt: string;
  itemCount: number;
  amount: string;
  currencyCode: string;
}

/**
 * Lists this customer's Draft Orders, newest first -- always a live Shopify Admin API call, never
 * cached, per this feature's own requirement that status must reflect any manual staff edit made
 * directly in Shopify Admin after the fact. `first: 50` (no pagination, matching this codebase's
 * established no-cursor-pagination convention -- see products.ts's listProductLines) is
 * deliberately generous for a customer-facing "recent orders" view, not a full-history report.
 *
 * `customer_id:<numeric>` is Shopify's documented search-query filter for draftOrders(query:) --
 * takes the bare numeric id, not the full GID, hence the extraction below.
 */
const GET_DRAFT_ORDER_DETAIL_QUERY = /* GraphQL */ `
  query GetDraftOrderDetail($id: ID!) {
    draftOrder(id: $id) {
      id
      name
      status
      createdAt
      email
      phone
      invoiceUrl
      order {
        statusPageUrl
      }
      shippingAddress {
        address1
        address2
        city
        province
        zip
        country
      }
      customer {
        id
        firstName
        lastName
      }
      lineItems(first: 50) {
        nodes {
          name
          variantTitle
          quantity
          image {
            url
          }
          originalUnitPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          variant {
            id
            availableForSale
          }
        }
      }
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
    }
  }
`;

const DRAFT_ORDER_GID_RE = /^gid:\/\/shopify\/DraftOrder\/\d+$/;

export interface CustomerOrderLineItem {
  name: string;
  variantTitle: string | null;
  quantity: number;
  image: string | null;
  unitAmount: string;
  currencyCode: string;
  /** Null for a custom line item with no product/variant attached (an admin can type an
   * arbitrary line into a Draft Order in Shopify) -- nothing to re-add to cart for those.
   * `availableForSale` is false once a variant's since been discontinued/archived -- reorder
   * skips both cases and reports them back to the customer rather than silently failing. */
  variantId: string | null;
  availableForSale: boolean;
}

export interface CustomerOrderDetail extends CustomerOrderSummary {
  email: string | null;
  phone: string | null;
  /** The correct link to show the customer for THIS order's current status, or null if none
   * applies -- never OPEN's raw invoiceUrl by itself. Two real Shopify behaviors forced this to
   * be computed rather than just passing invoiceUrl straight through (verified live against this
   * store, not assumed):
   *   - INVOICE_SENT: invoiceUrl is a live, payable checkout link and works correctly.
   *   - COMPLETED: invoiceUrl is DEAD -- Shopify returns a flat 404 ("invoice has already been
   *     paid") once a draft order is paid/converted, because that URL is fundamentally a
   *     *payment* link, not a permanent receipt link. A completed draft order converts into a
   *     real Shopify `Order`, which has its own separate, persistent `statusPageUrl` -- THAT is
   *     the correct link once COMPLETED.
   *   - OPEN/CANCELLED/EXPIRED: null -- OPEN is still a mutable draft (see decision log), and
   *     CANCELLED/EXPIRED have no valid link to show at all.
   */
  invoiceUrl: string | null;
  shippingAddress: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
  } | null;
  customerName: string | null;
  /** "<W|R>-<PROVINCE>-<YY>-<SEQ>" -- never a Shopify field, this app's own identifier, always
   * attached by the route (customer-order-detail/route.ts) from Supabase, not part of the
   * Shopify query at all. Null until the route fills it in. */
  accountNumber: string | null;
  lineItems: CustomerOrderLineItem[];
}

/**
 * Fetches one Draft Order's full detail (line items, customer contact, shipping address) --
 * only if it actually belongs to `shopifyCustomerId`. Returns `null` for "doesn't exist" and "not
 * yours" alike (never distinguished) -- an approved customer could otherwise enumerate other
 * customers' order IDs by noticing which ones come back "found but forbidden" vs "not found".
 * `orderId` is validated against the exact DraftOrder GID shape before ever reaching Shopify, both
 * as cheap input hygiene and so a malformed id fails fast with a clear local error instead of a
 * confusing round-trip.
 */
export async function getDraftOrderDetail(
  orderId: string,
  shopifyCustomerId: string
): Promise<CustomerOrderDetail | null> {
  if (!DRAFT_ORDER_GID_RE.test(orderId)) {
    throw new Error(`getDraftOrderDetail: unexpected DraftOrder GID shape: ${orderId}`);
  }

  // Allowing, not the plain shopifyAdminRequest -- this store's Shopify plan blocks reading
  // email/phone/shippingAddress.address1/.address2/.zip/customer.firstName/.lastName (Protected
  // Customer Data requires the Shopify/Advanced/Plus plan; live-verified 2026-09-18, see
  // isProtectedCustomerDataError's doc comment in admin-client.core.ts). Those specific fields
  // come back `null` below -- the caller (customer-order-detail route) backfills them from this
  // app's own Supabase `customers` table instead of losing the whole order (line items, price,
  // status) over 7 blocked fields.
  const data = await shopifyAdminRequestAllowingPiiGaps<any>(GET_DRAFT_ORDER_DETAIL_QUERY, { id: orderId });
  const order = data.draftOrder;
  if (!order || order.customer?.id !== shopifyCustomerId) {
    return null;
  }

  return {
    id: order.id,
    name: order.name,
    status: order.status,
    createdAt: order.createdAt,
    itemCount: order.lineItems.nodes.reduce((sum: number, li: any) => sum + li.quantity, 0),
    amount: order.totalPriceSet.shopMoney.amount,
    currencyCode: order.totalPriceSet.shopMoney.currencyCode,
    email: order.email,
    phone: order.phone,
    invoiceUrl:
      order.status === 'COMPLETED'
        ? (order.order?.statusPageUrl ?? null)
        : order.status === 'INVOICE_SENT'
          ? order.invoiceUrl
          : null,
    shippingAddress: order.shippingAddress,
    customerName: [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ') || null,
    accountNumber: null, // always filled in by the route, from Supabase -- never a Shopify field
    lineItems: order.lineItems.nodes.map((li: any) => ({
      name: li.name,
      variantTitle: li.variantTitle,
      quantity: li.quantity,
      image: li.image?.url ?? null,
      unitAmount: li.originalUnitPriceSet.shopMoney.amount,
      currencyCode: li.originalUnitPriceSet.shopMoney.currencyCode,
      variantId: li.variant?.id ?? null,
      availableForSale: li.variant?.availableForSale ?? false,
    })),
  };
}

const PLAIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Shopify's search-query date filter only reliably accepts a plain YYYY-MM-DD date -- a full
 * ISO timestamp (with a time component) confirmed live to trip a parser warning
 * (`created_at:>=2020-01-01T00:00:00Z` gets misread, splitting on the colon) and silently returns
 * unfiltered results instead of erroring. `from`/`to` are never quoted in the query (Shopify's
 * date fields aren't quoted values), so this strict format check is also this function's only
 * defense against query-string injection via a malformed date -- reject rather than attempt to
 * escape a bare, unquoted token. */
function validateDate(date: string, label: string): string {
  if (!PLAIN_DATE_RE.test(date)) {
    throw new Error(`listDraftOrdersForShopifyCustomer: invalid ${label} date "${date}", expected YYYY-MM-DD`);
  }
  return date;
}

export interface DraftOrderDateRange {
  /** Inclusive. */
  from?: string;
  /** Inclusive. */
  to?: string;
}

export async function listDraftOrdersForShopifyCustomer(
  shopifyCustomerId: string,
  dateRange?: DraftOrderDateRange
): Promise<CustomerOrderSummary[]> {
  const numericId = shopifyCustomerId.match(/(\d+)$/)?.[1];
  if (!numericId) {
    throw new Error(`listDraftOrdersForShopifyCustomer: unexpected Shopify Customer GID shape: ${shopifyCustomerId}`);
  }

  const queryParts = [`customer_id:${numericId}`];
  if (dateRange?.from) queryParts.push(`created_at:>=${validateDate(dateRange.from, 'from')}`);
  if (dateRange?.to) queryParts.push(`created_at:<=${validateDate(dateRange.to, 'to')}`);

  const data = await shopifyAdminRequest<any>(LIST_DRAFT_ORDERS_BY_CUSTOMER_QUERY, {
    query: queryParts.join(' AND '),
  });

  return (data.draftOrders.nodes as any[]).map((n) => ({
    id: n.id,
    name: n.name,
    status: n.status,
    createdAt: n.createdAt,
    itemCount: n.totalQuantityOfLineItems,
    amount: n.totalPriceSet.shopMoney.amount,
    currencyCode: n.totalPriceSet.shopMoney.currencyCode,
  }));
}
