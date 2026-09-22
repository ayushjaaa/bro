import { z } from 'zod';

/**
 * Shape check for the storefront -> admin "create draft order" call. The shared secret proves WHO is
 * calling; it does not prove the body is sane, so every field is checked here before anything
 * touches Shopify or the database. Deliberately lenient where real data varies (address lines,
 * postal-code formatting) and strict where a wrong value is dangerous (ids, quantities, enums).
 *
 * Note what is NOT taken on trust from this body even after it passes: the customer's email,
 * account type and Shopify id come from the `customers` row for `customerId`, never from here.
 */
const VARIANT_GID = /^gid:\/\/shopify\/ProductVariant\/\d{1,20}$/;
// Any printable characters, no control characters -- Shopify decides whether a code is valid.
const NO_CONTROL_CHARS = /^[^\u0000-\u001f\u007f]*$/;

const text = (max: number) => z.string().max(max).regex(NO_CONTROL_CHARS);

const address = z.object({
  firstName: text(100).min(1),
  lastName: text(100).min(1),
  address1: text(200).min(1),
  address2: text(200).optional(),
  city: text(100).min(1),
  provinceCode: text(60).min(1),
  zip: text(20).min(1),
});

const lineItem = z.object({
  variantId: z.string().regex(VARIANT_GID),
  quantity: z.number().int().min(1).max(10_000),
});

export const createDraftOrderSchema = z
  .object({
    lineItems: z.array(lineItem).min(1).max(200),
    email: z.string().max(254).optional(), // ignored -- the customer's stored email is used
    customerId: z.string().uuid(),
    fulfillmentMethod: z.enum(['ship', 'pickup']),
    shippingAddress: address.optional(),
    billingAddress: address.optional(),
    pickupLocationName: text(200).optional(),
    note: text(1000).optional(),
    discountCode: text(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.fulfillmentMethod === 'ship' && !value.shippingAddress) {
      ctx.addIssue({ code: 'custom', path: ['shippingAddress'], message: 'required when shipping' });
    }
    if (value.fulfillmentMethod === 'pickup' && !value.pickupLocationName?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['pickupLocationName'], message: 'required for pickup' });
    }
  });

export type ValidatedDraftOrderInput = z.infer<typeof createDraftOrderSchema>;

export const MAX_BODY_CHARS = 100_000;

/** Never throws. `issues` is for server logs only -- do not send it back to the caller. */
export function parseCreateDraftOrderInput(
  raw: unknown
): { ok: true; data: ValidatedDraftOrderInput } | { ok: false; issues: string[] } {
  const result = createDraftOrderSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, issues: result.error.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`) };
}
