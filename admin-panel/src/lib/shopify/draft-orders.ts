import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from './admin-client';
import { getApprovedCustomerForOrder } from '@/data/customer-order-identity';
import { findRegionMismatches, normalizeProvince, REGION_RULE_ENABLED } from '@/lib/region-rules';
import { describeShortfalls, findStockShortfalls, type VariantStock } from '@/lib/inventory-rules';

/**
 * Draft Order creation for the storefront's custom checkout (Part 1 of the checkout/dashboard
 * feature -- see the conversation's research trail / this project's own DECISIONS.md item 19 for
 * why: `draftOrderCreate` is Admin-API-only, confirmed multiple independent ways it does not exist
 * anywhere in the Storefront API, so this MUST live here, never in the storefront app itself.
 *
 * Deliberately does NOT call draftOrderComplete -- the order stays a Draft until a staff member
 * completes it directly in Shopify's own admin (DECISIONS.md item 36: Draft Orders are explicitly
 * NOT managed through this admin-panel's own UI). No shippingLine (shipping cost is out of scope
 * for now), no payment collection.
 */

const CREATE_DRAFT_ORDER_MUTATION = /* GraphQL */ `
  mutation CreateDraftOrder($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// `money`-typed metafields (custom.retail_price) store their own currency_code, but the shop's
// own currency is fetched here too for the fallback path (no retail_price set -> use the
// variant's native price, which VARIANT_PRICES_QUERY returns as a bare string with no currency).
let cachedShopCurrency: string | null = null;
async function getShopCurrency(): Promise<string> {
  if (cachedShopCurrency) return cachedShopCurrency;
  const data = await shopifyAdminRequest<{ shop: { currencyCode: string } }>('{ shop { currencyCode } }');
  cachedShopCurrency = data.shop.currencyCode;
  return cachedShopCurrency;
}

// Only ever run for a `retail` customer (see createDraftOrder) -- a `wholesale` customer needs no
// override at all, since Shopify's native price already IS the wholesale price. Fetches fresh at
// order-creation time, never reusing anything the storefront might have shown, so a stale/cached
// display price can never leak into what's actually charged.
const VARIANT_PRICES_QUERY = /* GraphQL */ `
  query VariantPricesForDraftOrder($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        price
        retailPriceField: metafield(namespace: "custom", key: "retail_price") {
          value
        }
      }
    }
  }
`;

const VARIANT_CHECK_QUERY = /* GraphQL */ `
  query VariantChecksForDraftOrder($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        inventoryQuantity
        inventoryPolicy
        inventoryItem {
          tracked
        }
        product {
          title
          tags
        }
      }
    }
  }
`;

export type FulfillmentMethod = 'ship' | 'pickup';

export interface DraftOrderLineItem {
  variantId: string;
  quantity: number;
}

export interface ShippingAddressInput {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  /** Two-letter Canadian province code (e.g. "SK", "ON") -- Shopify's `provinceCode` field, not
   * the deprecated full-name `province` field on MailingAddressInput. */
  provinceCode: string;
  zip: string;
}

export interface CreateDraftOrderInput {
  lineItems: DraftOrderLineItem[];
  /** Ignored: the order's email always comes from the customer's own `customers` row. */
  email?: string;
  fulfillmentMethod: FulfillmentMethod;
  /** Required when fulfillmentMethod is 'ship'. */
  shippingAddress?: ShippingAddressInput;
  /** Sent on every order regardless of fulfillment method -- billing is about invoicing, not
   * delivery. Storefront's CheckoutPage.tsx always resolves a real address before calling this
   * (either the same one as shipping, or a separately-picked billing location), so it's expected
   * on every call even though it's typed optional here for forward compatibility. */
  billingAddress?: ShippingAddressInput;
  /** Required when fulfillmentMethod is 'pickup' -- folded into customAttributes since DraftOrder
   * has no native pickup-location field (confirmed via Shopify's own schema docs). */
  pickupLocationName?: string;
  /** This app's own Supabase `customers.id` -- stored as a custom attribute so a later phase
   * (order-history mirroring) can read it back off the webhook payload and know which customer
   * this draft belongs to, without ever needing a Shopify customerId/customerAccessToken. */
  customerId: string;
  note?: string;
  /** A real Shopify discount code (created in Shopify Admin) -- passed straight through to
   * `discountCodes` so Shopify itself validates and calculates it; we never fake the math
   * ourselves. */
  discountCode?: string;
}

export interface CreateDraftOrderResult {
  ok: true;
  draftOrderId: string;
  name: string;
}

export interface CreateDraftOrderError {
  ok: false;
  error: string;
  /** HTTP status the route should answer with (defaults to 422). */
  status?: 403 | 422 | 503;
}

export async function createDraftOrder(
  input: CreateDraftOrderInput
): Promise<CreateDraftOrderResult | CreateDraftOrderError> {
  const customAttributes = [
    { key: 'Fulfillment Method', value: input.fulfillmentMethod === 'ship' ? 'Ship' : 'Pickup' },
    { key: '_customer_id', value: input.customerId },
    ...(input.fulfillmentMethod === 'pickup' && input.pickupLocationName
      ? [{ key: 'Pickup Location', value: input.pickupLocationName }]
      : []),
  ];

  // Dual-pricing trust boundary: the storefront never sends a price (see CreateDraftOrderInput --
  // there's no price field on DraftOrderLineItem), so the actual charged price is decided entirely
  // here, from account_type looked up fresh via this customer's own Supabase id -- never from
  // anything client-supplied. A `wholesale` customer (or a lookup failure -- safe default) needs
  // no extra work at all: Shopify's native price already IS the wholesale price, so lineItems are
  // built exactly as before, with no override and no extra Admin API call. Only a confirmed
  // `retail` customer triggers the extra price-resolution work below.
  // Identity comes from the database, never from the request body: the customer must exist and be
  // approved, and their email / price tier / Shopify id are read from their own row.
  let customer: Awaited<ReturnType<typeof getApprovedCustomerForOrder>>;
  try {
    customer = await getApprovedCustomerForOrder(input.customerId);
  } catch (err) {
    console.error('[createDraftOrder] customer lookup failed:', err);
    return { ok: false, error: 'Could not verify your account. Please try again.', status: 503 };
  }
  if (!customer) {
    return { ok: false, error: 'This account cannot place orders.', status: 403 };
  }
  const accountType = customer.accountType;

  // Authoritative item checks, against live Shopify data (lib/region-rules.ts + lib/inventory-rules.ts):
  //  * every variant must exist,
  //  * stock: a tracked, stop-selling-when-out variant can't be ordered beyond what is available,
  //  * shipped orders: the product's excise region must be allowed in the destination province.
  // The storefront checks some of this first for a friendlier message, but this is the real order
  // boundary and must not rely on that. Fails closed: if the data can't be read, no order is created.
  const province = input.fulfillmentMethod === 'ship' ? normalizeProvince(input.shippingAddress?.provinceCode) : null;
  if (input.fulfillmentMethod === 'ship' && !province) {
    return { ok: false, error: 'A valid Canadian shipping province is required.' };
  }
  try {
    const variantIds = [...new Set(input.lineItems.map((li) => li.variantId))];
    const checkData = await shopifyAdminRequest<{
      nodes: Array<{
        id: string;
        inventoryQuantity: number | null;
        inventoryPolicy: 'DENY' | 'CONTINUE';
        inventoryItem: { tracked: boolean } | null;
        product: { title: string; tags: string[] };
      } | null>;
    }>(VARIANT_CHECK_QUERY, { ids: variantIds });
    const byId = new Map(checkData.nodes.filter((n) => n?.id).map((n) => [n!.id, n!]));
    if (variantIds.some((id) => !byId.has(id))) {
      return { ok: false, error: 'One or more items could not be found.' };
    }

    const stock = new Map<string, VariantStock>();
    for (const [id, v] of byId) {
      stock.set(id, {
        productTitle: v.product.title,
        tracked: v.inventoryItem?.tracked ?? false,
        policy: v.inventoryPolicy,
        quantity: v.inventoryQuantity ?? 0,
      });
    }
    const shortfalls = findStockShortfalls(input.lineItems, stock);
    if (shortfalls.length > 0) {
      return { ok: false, error: `Not enough stock for: ${describeShortfalls(shortfalls)}. Please lower the quantity or remove the item.` };
    }

    // Region/province shipping restriction: DISABLED by business decision (REGION_RULE_ENABLED =
    // false in lib/region-rules.ts, 2026-09-22). A valid province is still required above for a
    // shipped order; it is just no longer matched against each product's region- tag.
    if (REGION_RULE_ENABLED && province) {
      const lines = input.lineItems.map((li) => {
        const product = byId.get(li.variantId)!.product;
        const tag = product.tags.find((t) => t.startsWith('region-'));
        return { name: product.title, region: tag ? tag.slice('region-'.length) : null };
      });
      const blocked = findRegionMismatches(lines, province);
      if (blocked.length > 0) {
        return {
          ok: false,
          error: `These items can't be shipped to the selected province: ${[...new Set(blocked.map((l) => l.name))].join(', ')}.`,
        };
      }
    }
  } catch (err) {
    console.error('[createDraftOrder] item check failed:', err);
    return { ok: false, error: 'Could not verify your items right now. Please try again.', status: 503 };
  }

  let lineItems: Array<{ variantId: string; quantity: number; priceOverride?: { amount: string; currencyCode: string } }> =
    input.lineItems.map((li) => ({ variantId: li.variantId, quantity: li.quantity }));

  // C2: same try/catch pattern as the stock/region check block above -- an unguarded Shopify
  // hiccup here used to propagate all the way out of the route handler uncaught, returning a raw
  // 500 instead of this route's normal JSON error contract.
  if (accountType === 'retail') {
    try {
      const variantIds = [...new Set(input.lineItems.map((li) => li.variantId))];
      const priceData = await shopifyAdminRequest<{
        nodes: Array<{ id: string; price: string; retailPriceField: { value: string } | null } | null>;
      }>(VARIANT_PRICES_QUERY, { ids: variantIds });

      const currencyCode = await getShopCurrency();
      const resolvedPriceByVariantId = new Map<string, string>();
      for (const node of priceData.nodes) {
        if (!node?.id) continue;
        let retailPrice: string | null = null;
        if (node.retailPriceField?.value) {
          try {
            retailPrice = JSON.parse(node.retailPriceField.value).amount ?? null;
          } catch {
            retailPrice = null;
          }
        }
        // Missing retail price -> fall back to the native (wholesale) price, same rule as every
        // other display surface (storefront product/cart, admin's own Cart page).
        resolvedPriceByVariantId.set(node.id, retailPrice ?? node.price);
      }

      lineItems = input.lineItems.map((li) => {
        const resolvedPrice = resolvedPriceByVariantId.get(li.variantId);
        // A variant that failed to resolve (deleted, bad id) is left with no override -- Shopify's
        // own error handling for an invalid variantId still applies; we simply don't compound that
        // with a guessed price.
        return resolvedPrice
          ? { variantId: li.variantId, quantity: li.quantity, priceOverride: { amount: resolvedPrice, currencyCode } }
          : { variantId: li.variantId, quantity: li.quantity };
      });
    } catch (err) {
      console.error('[createDraftOrder] retail price resolution failed:', err);
      return { ok: false, error: 'Could not verify pricing. Please try again.', status: 503 };
    }
  }

  const draftOrderInput: Record<string, unknown> = {
    lineItems,
    email: customer.email,
    customAttributes,
  };
  if (input.note) draftOrderInput.note = input.note;
  if (input.discountCode) draftOrderInput.discountCodes = [input.discountCode];

  // Links this Draft Order to the customer's real Shopify Customer record (needed so the
  // customer-orders feature can list "my orders" via Shopify's own `customer_id:` search) --
  // never blocks order creation if this lookup comes back empty, only omits the link (see
  // getShopifyCustomerIdForCustomer's own doc comment for why that should be unreachable for an
  // approved customer, but is still handled defensively rather than assumed impossible).
  if (customer.shopifyCustomerId) {
    draftOrderInput.purchasingEntity = { customerId: customer.shopifyCustomerId };
  }

  if (input.fulfillmentMethod === 'ship') {
    if (!input.shippingAddress) {
      return { ok: false, error: 'shippingAddress is required when fulfillmentMethod is "ship"' };
    }
    const a = input.shippingAddress;
    draftOrderInput.shippingAddress = {
      firstName: a.firstName,
      lastName: a.lastName,
      address1: a.address1,
      address2: a.address2,
      city: a.city,
      provinceCode: a.provinceCode,
      zip: a.zip,
      // Business is Canada-only for now (this project's own DECISIONS.md item 24) -- hardcoded
      // rather than accepting arbitrary customer input for a field that has exactly one valid
      // value today.
      countryCode: 'CA',
    };
  } else if (input.fulfillmentMethod === 'pickup' && !input.pickupLocationName) {
    return { ok: false, error: 'pickupLocationName is required when fulfillmentMethod is "pickup"' };
  }

  if (input.billingAddress) {
    const b = input.billingAddress;
    draftOrderInput.billingAddress = {
      firstName: b.firstName,
      lastName: b.lastName,
      address1: b.address1,
      address2: b.address2,
      city: b.city,
      provinceCode: b.provinceCode,
      zip: b.zip,
      countryCode: 'CA', // Same Canada-only reasoning as shippingAddress above.
    };
  }

  try {
    const data = await shopifyAdminRequest<any>(CREATE_DRAFT_ORDER_MUTATION, { input: draftOrderInput });
    assertNoUserErrors(data.draftOrderCreate.userErrors, 'draftOrderCreate');
    const draftOrder = data.draftOrderCreate.draftOrder;
    if (!draftOrder) return { ok: false, error: 'draftOrderCreate returned no draft order and no userErrors' };
    return { ok: true, draftOrderId: draftOrder.id, name: draftOrder.name };
  } catch (err) {
    // ShopifyAdminApiError's `.errors` carries the actual userErrors array (field + message per
    // entry) -- assertNoUserErrors' thrown message alone ("draftOrderCreate returned userErrors")
    // is useless for debugging without it, so always log the full detail server-side even though
    // the HTTP response back to the storefront stays a short message.
    if (err && typeof err === 'object' && 'errors' in err) {
      console.error('[createDraftOrder] Shopify userErrors:', JSON.stringify((err as { errors: unknown }).errors, null, 2));
    }
    // Detail stays in the server log; the buyer gets a generic line (Shopify's raw text is not for them).
    const detail = err && typeof err === 'object' && 'errors' in err ? JSON.stringify((err as { errors: unknown }).errors) : '';
    if (/discount/i.test(detail)) return { ok: false, error: 'That discount code is not valid.' };
    console.error('[createDraftOrder] failed:', err);
    return { ok: false, error: 'Could not place your order. Please try again.' };
  }
}
