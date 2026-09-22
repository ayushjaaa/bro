import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';

/** Service Role client — bypasses RLS. Never expose to the client; only used here. */
function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Resolves this app's own Supabase `customers.id` to the Shopify Customer GID
 * (`customers.shopify_customer_id`) written once at approval time (see `approveCustomer()` in
 * `data/customers.ts`, via `findOrCreateShopifyCustomer()`). Returns `null` if the row doesn't
 * exist, isn't `approved`, or the column is somehow unset -- should not happen for an approved
 * customer, since the same request that flips a row to `approved` also resolves this value, but
 * this must never throw for that case, just report it, so callers can decide what "no linked
 * Shopify customer yet" means for their own flow (e.g. a Draft Order still gets created without
 * `purchasingEntity` rather than blocking a purchase, and an order-history lookup just returns an
 * empty list).
 *
 * The `status = 'approved'` check is explicit here (project rule: any function that returns a
 * customer's own data must verify approved+logged-in itself, never rely on an upstream caller or
 * an incidental column-null coincidence) -- previously this relied only on `shopify_customer_id`
 * happening to be null before approval, which is not a guarantee against a future code path.
 *
 * Deliberately does NOT call `requireAdmin()`, unlike every other function in `data/customers.ts`
 * -- this is called from internal-secret-gated API routes (storefront-to-admin-panel calls), which
 * have no admin session at all, same reasoning as `create-draft-order/route.ts`'s own doc comment
 * ("No requireAdmin() here deliberately... The shared secret IS the trust boundary"). Kept in its
 * own file rather than exported from `data/customers.ts` (whose every other export assumes an
 * admin session) so that distinction is visible at the file level, not just in one comment.
 */
export async function getShopifyCustomerIdForCustomer(customerId: string): Promise<string | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('customers')
    .select('shopify_customer_id, status')
    .eq('id', customerId)
    .maybeSingle();
  if (error || !data || data.status !== 'approved') return null;
  return data.shopify_customer_id;
}

export interface CustomerOrderContactInfo {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  shipLine1: string | null;
  shipLine2: string | null;
  shipPostalCode: string | null;
  /** "<W|R>-<PROVINCE>-<YY>-<SEQ>" (014 migration), e.g. "W-ON-26-0142" -- assigned at approval,
   * never a Shopify field at all (purely this app's own identifier), so unlike the fields above
   * this is never a PII-restriction backfill, just data that only ever lived here. Included so
   * the invoice page can build a filename that's actually unique per customer+order instead of
   * relying on the order name alone (which two different Shopify stores, or two draft orders far
   * apart in time, could otherwise collide on). */
  accountNumber: string | null;
}

/**
 * Backfill source for the exact fields Shopify's Protected Customer Data plan restriction blocks
 * on a DraftOrder read (see isProtectedCustomerDataError in admin-client.core.ts): customer
 * name/email/phone and the precise street address/postal code. This app already collected all of
 * it directly from the customer at registration (008 migration) -- reading it back from our own
 * Supabase row is not a workaround-quality substitute, it's the same data, just sourced from where
 * we already have it instead of re-asking Shopify for something Shopify won't currently hand back.
 * Returns all-null (never throws) if the row is missing or not `approved`, same "report, don't
 * blow up" posture as `getShopifyCustomerIdForCustomer` above -- same explicit approval check for
 * the same reason (project rule: this function returns a customer's own PII, so it verifies
 * approved itself rather than trusting the caller).
 */
export async function getCustomerOrderContactInfo(customerId: string): Promise<CustomerOrderContactInfo> {
  const empty: CustomerOrderContactInfo = {
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    shipLine1: null,
    shipLine2: null,
    shipPostalCode: null,
    accountNumber: null,
  };
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('customers')
    .select('first_name, last_name, email, phone, ship_line1, ship_line2, ship_postal_code, account_number, status')
    .eq('id', customerId)
    .maybeSingle();
  if (error || !data || data.status !== 'approved') return empty;
  return {
    firstName: data.first_name ?? null,
    lastName: data.last_name ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    shipLine1: data.ship_line1 ?? null,
    shipLine2: data.ship_line2 ?? null,
    shipPostalCode: data.ship_postal_code ?? null,
    accountNumber: data.account_number ?? null,
  };
}
