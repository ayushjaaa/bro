import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from './admin-client';
import { getShopifyCustomerIdForCustomer } from '@/data/customer-shopify-id';
import { getAccountTypeForCustomer } from '@/data/customer-account-type';

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
  email: string;
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
  const accountType = await getAccountTypeForCustomer(input.customerId);

  let lineItems: Array<{ variantId: string; quantity: number; priceOverride?: { amount: string; currencyCode: string } }> =
    input.lineItems.map((li) => ({ variantId: li.variantId, quantity: li.quantity }));

  if (accountType === 'retail') {
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
  }

  const draftOrderInput: Record<string, unknown> = {
    lineItems,
    email: input.email,
    customAttributes,
  };
  if (input.note) draftOrderInput.note = input.note;
  if (input.discountCode) draftOrderInput.discountCodes = [input.discountCode];

  // Links this Draft Order to the customer's real Shopify Customer record (needed so the
  // customer-orders feature can list "my orders" via Shopify's own `customer_id:` search) --
  // never blocks order creation if this lookup comes back empty, only omits the link (see
  // getShopifyCustomerIdForCustomer's own doc comment for why that should be unreachable for an
  // approved customer, but is still handled defensively rather than assumed impossible).
  const shopifyCustomerId = await getShopifyCustomerIdForCustomer(input.customerId);
  if (shopifyCustomerId) {
    draftOrderInput.purchasingEntity = { customerId: shopifyCustomerId };
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
    return { ok: false, error: err instanceof Error ? err.message : 'createDraftOrder failed' };
  }
}
