import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from './admin-client';
import { getShopifyCustomerIdForCustomer } from '@/data/customer-shopify-id';

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

  const draftOrderInput: Record<string, unknown> = {
    lineItems: input.lineItems.map((li) => ({ variantId: li.variantId, quantity: li.quantity })),
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

  try {
    const data = await shopifyAdminRequest<any>(CREATE_DRAFT_ORDER_MUTATION, { input: draftOrderInput });
    assertNoUserErrors(data.draftOrderCreate.userErrors, 'draftOrderCreate');
    const draftOrder = data.draftOrderCreate.draftOrder;
    if (!draftOrder) return { ok: false, error: 'draftOrderCreate returned no draft order and no userErrors' };
    return { ok: true, draftOrderId: draftOrder.id, name: draftOrder.name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'createDraftOrder failed' };
  }
}
