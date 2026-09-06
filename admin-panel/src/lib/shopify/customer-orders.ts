import 'server-only';
import { shopifyAdminRequest } from './admin-client';

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
}

export interface CustomerOrderDetail extends CustomerOrderSummary {
  email: string | null;
  phone: string | null;
  shippingAddress: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
  } | null;
  customerName: string | null;
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

  const data = await shopifyAdminRequest<any>(GET_DRAFT_ORDER_DETAIL_QUERY, { id: orderId });
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
    shippingAddress: order.shippingAddress,
    customerName: [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ') || null,
    lineItems: order.lineItems.nodes.map((li: any) => ({
      name: li.name,
      variantTitle: li.variantTitle,
      quantity: li.quantity,
      image: li.image?.url ?? null,
      unitAmount: li.originalUnitPriceSet.shopMoney.amount,
      currencyCode: li.originalUnitPriceSet.shopMoney.currencyCode,
    })),
  };
}

export async function listDraftOrdersForShopifyCustomer(
  shopifyCustomerId: string
): Promise<CustomerOrderSummary[]> {
  const numericId = shopifyCustomerId.match(/(\d+)$/)?.[1];
  if (!numericId) {
    throw new Error(`listDraftOrdersForShopifyCustomer: unexpected Shopify Customer GID shape: ${shopifyCustomerId}`);
  }

  const data = await shopifyAdminRequest<any>(LIST_DRAFT_ORDERS_BY_CUSTOMER_QUERY, {
    query: `customer_id:${numericId}`,
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
